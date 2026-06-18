# CLAUDE.md — KazFood: Генератор протоколов охраны труда

## TL;DR

Клиентское Next.js приложение. Пользователь вставляет JSON → выбирает тип документа → скачивает .docx.
Никакой БД, никакого сервера, никаких API routes. Всё работает в браузере.
Система реестро-driven: добавить документ = одна запись в `DOCUMENT_REGISTRY`. Никаких `switch (docType)`.

---

## Стек

- **Framework**: Next.js 15 (App Router), `"use client"` на `page.tsx`
- **UI**: React 19 / TypeScript strict
- **Валидация**: Zod
- **DOCX рендер**: docxtemplater + PizZip
- **Скачивание**: file-saver
- **CSS**: Tailwind 4
- **Деплой**: Vercel, ветка `main` = продакшн
- **Контроль версий**: Git / GitHub

---

## Архитектура — КРИТИЧНО

### Три ключевых модуля

| Модуль | Путь | Роль |
|--------|------|------|
| UI / state | `src/app/page.tsx` | Единственная страница, не знает о конкретных документах |
| Реестр документов | `src/lib/docs/registry.ts` | `DOCUMENT_REGISTRY` — единственный источник правды |
| Движок рендера | `src/lib/docs/engine.ts` | Единственное место где используется docxtemplater / PizZip / file-saver |

### Пайплайн (не нарушать)
JSON input → safeParse(schema) → buildContext(data) → fetchTemplate → renderBlob → saveAs

### Запрещённые паттерны

- **НЕ писать** `switch (docType)` / `if (docType === "...")` вне `DOCUMENT_REGISTRY`
- **НЕ импортировать** `docxtemplater` / `pizzip` / `file-saver` вне `engine.ts`
- **НЕ трогать** `page.tsx` при добавлении нового документа
- **НЕ дублировать** `flatten()` — использовать только `import { flatten } from "./docs/flatten"`
- **НЕ писать** локальный `class TemplateRenderError` — только `import` из `engine.ts`
- **НЕ писать** `const nonEmpty = z.string()...` в новых схемах — только `import { nonEmpty } from "@/lib/docs/zod-helpers"`

---

## Типы документов (11 штук)

| Key | Label в UI | Шаблон |
|-----|-----------|--------|
| `lighting` | Освещенность | `lighting-protocol.docx` |
| `emp` | ЭМП | `emp-protocol.docx` |
| `noise` | Шум | `noise-protocol.docx` |
| `heaviness` | Тяжесть | `heaviness-protocol.docx` |
| `tension` | Напряженность | `tension-protocol.docx` |
| `safety` | Травмобезопасность | `safety-protocol.docx` |
| `siz` | СИЗ | `siz-protocol.docx` |
| `meteo` | Микроклимат | `meteo-protocol.docx` |
| `summary` | Сводный протокол | `summary-protocol.docx` |
| `conclusion` | Заключение | `conclusion-protocol.docx` |
| `coding` | Кодировка | `coding-protocol.docx` |

Шаблоны лежат в `public/templates/` — не бандлятся, отдаются Next.js как статика.

---

## Как добавить новый документ (единственный правильный способ)

1. `src/types/<name>.ts` — интерфейс
2. `src/lib/<name>Schema.ts` — Zod схема (импортировать `nonEmpty` из `zod-helpers`)
3. `src/lib/<name>ExampleData.ts` — пример данных
4. `public/templates/<name>-protocol.docx` — шаблон с плейсхолдерами
5. `src/lib/generate<Name>Docx.ts` — тонкий wrapper с `buildTemplateContext()`
6. `src/lib/docs/registry.ts` — добавить `describe<T>({...})` в `DOCUMENT_REGISTRY`

`page.tsx` — **не трогать**. Новый таб появится автоматически.

---

## Структура папок
src/

├── app/

│   ├── layout.tsx          — html lang="ru", metadata

│   └── page.tsx            — единственная страница (154 LOC)

├── components/

│   ├── JsonInput.tsx        — <textarea>

│   └── ValidationErrors.tsx — панель ошибок

├── lib/

│   ├── docs/               ← общий слой абстракции

│   │   ├── engine.ts       — fetch + renderBlob + saveAs (единственный рендер)

│   │   ├── registry.ts     — DOCUMENT_REGISTRY + findDescriptor + renderDescriptor

│   │   ├── flatten.ts      — dotted-key flatten для docxtemplater

│   │   ├── rows.ts         — flattenPlacesMeasurements / flattenSectionsRows / flattenWorkplaceFactors

│   │   ├── indicators.ts   — expandIndicator (4-class) / expandClassCount (6-class)

│   │   ├── aggregate.ts    — sumBy

│   │   └── zod-helpers.ts  — nonEmpty / optStr / formatZodIssues / ValidationIssue

│   ├── generate<Name>Docx.ts   — 11 тонких wrapper'ов

│   ├── <name>Schema.ts         — 11 Zod схем

│   └── <name>ExampleData.ts    — 11 примеров данных

├── types/                  — 11 TypeScript интерфейсов

public/

└── templates/              — 11 .docx шаблонов (статика)
---

## Shared helpers — когда что использовать

| Задача | Что использовать |
|--------|-----------------|
| Flatten объекта для docxtemplater | `flatten(data, { skipKeys: [...] })` из `docs/flatten` |
| Строки место+измерения (noise, meteo) | `flattenPlacesMeasurements()` из `docs/rows` |
| Строки секция+строки (safety, siz, coding) | `flattenSectionsRows()` из `docs/rows` |
| Трёхуровневый flatten (summary) | `flattenWorkplaceFactors()` из `docs/rows` |
| Распределение по 4 классам (heaviness, tension) | `expandIndicator()` из `docs/indicators` |
| Распределение по 6 классам (conclusion) | `expandClassCount()` из `docs/indicators` |
| Суммирование (coding) | `sumBy()` из `docs/aggregate` |
| Строковое поле обязательное | `nonEmpty` из `docs/zod-helpers` |
| Строковое поле опциональное | `optStr` из `docs/zod-helpers` |

---

## Ошибки и обработка

- Единственный класс ошибок: `TemplateRenderError` из `engine.ts`
- `page.tsx` ловит через `err instanceof TemplateRenderError`
- Каждый wrapper реэкспортирует: `export { TemplateRenderError } from "./docs/engine"`

---

## Известный технический долг (не трогать без задачи)

Исправлено 2026-06-17 (аудит):
- ~~Локальный `const nonEmpty` в схемах~~ → все схемы импортируют `nonEmpty`/`optStr` из `zod-helpers`.
- ~~`ValidationErrors.tsx` импортирует `ValidationIssue` из `lightingSchema`~~ → теперь из `zod-helpers`; дубликат `ValidationIssue`/`formatZodIssues` в `lightingSchema.ts` удалён. (`page.tsx` больше не существует — UI на `AttestationEditor`, который уже брал `formatZodIssues` из `zod-helpers`.)
- ~~inline `switch` в `generateSummaryProtocolDocx.ts`~~ → заменён на `expandClassCount` (с маппингом суффиксов `class2…class4`).

Осталось:
- Есть Vitest (`npm test`), но покрыта в основном логика синхронизации/кодов/валидации; рендер DOCX проверяется отдельными ручными скриптами `scripts/test-*.js` (не через `engine.ts`).
- Вторая группа дублей XML-хелперов: `build-coding-template.js` и `build-siz-template.js` (не вынесена в `scripts/lib/`).
- `next lint` в этой версии Next не работает (проект на старом `.eslintrc`); линтер не запускается — полагаемся на `tsc` + Vitest.

---

## Деплой
git push origin main  →  автодеплой на Vercel