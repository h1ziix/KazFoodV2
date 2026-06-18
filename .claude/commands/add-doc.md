Помоги мне добавить новый тип документа в KazFood по архитектуре из CLAUDE.md.

Шаги:
1. Спроси название документа (key на английском, label на русском)
2. Создай `src/types/<name>.ts` — интерфейс
3. Создай `src/lib/<name>Schema.ts` — Zod схема (импортировать nonEmpty из zod-helpers)
4. Создай `src/lib/<name>ExampleData.ts` — пример данных
5. Создай `src/lib/generate<Name>Docx.ts` — wrapper с buildTemplateContext()
6. Добавь запись в `DOCUMENT_REGISTRY` в `src/lib/docs/registry.ts`
7. Напомни вручную создать шаблон `public/templates/<name>-protocol.docx`

Не трогать page.tsx.