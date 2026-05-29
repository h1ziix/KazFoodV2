# KazFoodV2

Генератор DOCX-протоколов аттестации рабочих мест с сохранением
проектов в Supabase.

## Быстрый старт

```bash
npm install
npm run dev
```

Перед запуском нужно поднять Supabase (см. ниже).

## Supabase setup

### 1. Создайте проект

На [supabase.com](https://supabase.com) → New project. Запомните:

- **Project URL** (`https://xxxxxxx.supabase.co`)
- **anon public** key (вкладка *Project Settings → API*)

### 2. Пропишите ключи в `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Без этих переменных приложение упадёт с понятным сообщением при первом
обращении к Supabase.

### 3. Накатите миграцию

В дашборде Supabase → *SQL Editor* → *New query* → вставьте содержимое
`supabase/migrations/0001_attestations.sql` → *Run*.

Миграция создаёт таблицу `attestations` с RLS-политиками `auth.uid()`,
триггером для `updated_at` и индексом для списка пользователя.

### 4. (опционально) Отключите подтверждение email

Для удобства локальной разработки: *Authentication → Sign In / Providers
→ Email → Confirm email = OFF*. Иначе после регистрации придётся
подтверждать ссылку из письма.

## Архитектура

### Сохранение состояния

- Каждая **аттестация** = одна строка в таблице `attestations`.
- В колонке `documents_data` (JSONB) лежит словарь
  `{ <doc-key>: <raw-form-state> }`. Ключи совпадают с
  `DOCUMENT_REGISTRY[].key` (`coding`, `safety`, `siz`, …).
- Значения — сырые объекты, какие сейчас живут в `useState` формы.
  **Генераторы DOCX получают тот же объект данных**, что и раньше —
  изменился только источник (Supabase row вместо локального state).
- `approval_data` и `common_data` зарезервированы для будущего выноса
  общих полей (заказчик / реквизиты согласующих).

### Autosave

- Реализован в `src/components/attestations/AttestationShell.tsx`.
- Debounce **1.5 с**: каждое изменение откладывает таймер; перед
  отправкой летит **полный snapshot** (title + customer + documents) —
  никакой merge-логики на сервере.
- Кнопка «Сохранить» сбрасывает debounce и пишет немедленно.
- `updated_at` всегда выставляет триггер БД — клиент его никогда не
  отправляет.

### Auth

- Email + password через Supabase Auth.
- Middleware (`src/middleware.ts`) обновляет cookie-сессию на каждом
  запросе и редиректит неаутентифицированных на `/login?next=…`.
- Server Actions для входа/регистрации/выхода: `src/lib/auth/actions.ts`.

### Дублирование

Кнопка «Создать копию» на странице `/attestations` вызывает
`duplicateAttestation(id)`. Она копирует `customer_name`,
`customer_address`, `documents_data`, `approval_data`, `common_data` в
новую строку с новым `id` и заголовком вида `"<source> (копия)"`. Обе
аттестации после этого независимы — правка одной не затрагивает другую.

## Структура

```
src/
├─ app/
│  ├─ page.tsx                 # → redirect /attestations
│  ├─ login/, signup/          # Supabase Auth
│  └─ attestations/
│     ├─ page.tsx              # список проектов (Server Component)
│     └─ [id]/page.tsx         # редактор
├─ components/
│  ├─ attestations/
│  │  ├─ AttestationEditor.tsx     # табы документов + DOCX-кнопка
│  │  ├─ AttestationShell.tsx      # autosave + header-поля
│  │  └─ AttestationRowActions.tsx # действия в списке
│  └─ forms/, ValidationErrors.tsx # без изменений
├─ lib/
│  ├─ attestations/
│  │  ├─ repository.ts         # CRUD + duplicate
│  │  └─ actions.ts            # server actions
│  ├─ auth/actions.ts          # signIn / signUp / signOut
│  ├─ supabase/
│  │  ├─ env.ts                # fail-fast env resolution
│  │  ├─ client.ts             # browser client (singleton)
│  │  └─ server.ts             # per-request server client
│  ├─ docs/, forms/            # DOCX-движок — не менялся
│  └─ <documents>Schema.ts     # zod-схемы — не менялись
└─ types/database.ts           # типы строк Supabase
```

## Что НЕ поменялось

- DOCX-генерация (`renderDescriptor`, все `generate*Docx.ts`,
  `DOCUMENT_REGISTRY`) — байт-в-байт прежняя.
- Zod-схемы документов.
- `FormRenderer`, валидация, error map, UX генерации.

## Команды

```bash
npm run dev        # дев-сервер
npm run build      # прод-сборка
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```
