Проверь данные перед генерацией DOCX на типичные ошибки которые находит клиент.

## Шаг 1. Определи тип документа

Попроси пользователя вставить JSON, который он собирается использовать, и узнай тип документа.

Если пользователь не назвал тип явно — **определи его сам по корню JSON** и подтверди догадку:

| Тип (`key`) | Документ | Отличительные признаки корня JSON |
|-------------|----------|-----------------------------------|
| `cover` | Обложка | `customer.organization` + `archiveYear`, нет `protocol` |
| `intro` | Введение | `workplaceCount` + `heavinessCounts` / `tensionCounts` |
| `coding` | Кодировка | `approval` + `sections[].rows[].count` (только 0/1), нет `customer` |
| `meteo` | Микроклимат | `places[].measurements[].workCategory` + `timeOfDay` / `humidityMeasured` |
| `lighting` | Освещенность | `places[].measurements[].lightingSystem` + `keo` |
| `emp` | ЭМП | `places[].measurements[].range1` / `range2` |
| `noise` | Шум | `places[].measurements[]` с `octaves` / `allowed`, без `workCategory` и `range1` |
| `summary` | Сводный протокол | `measuringTools[]` + `places[].workplaces[].factors[]` |
| `heaviness` | Тяжесть | `workplaces[]` с показателями `p1_1_regional` и т.п. |
| `tension` | Напряженность | `workplaces[]` с показателями `p1_1_content` и т.п. |
| `safety` | Травмобезопасность | `sections[].rows[].documentation` / `result` |
| `siz` | СИЗ | `sections[].rows[].issuedFact` / `normItems` |
| `conclusion` | Заключение | `rows[].labelRu` + `workplaceCodeNote`, нет `protocol` |

Если однозначно определить не удаётся — спроси пользователя, какой это документ.

## Шаг 2. Универсальные проверки (для всех типов)

### Типографика
- Дефис (-) вместо тире (—/–) в текстовых полях: названия, должности, организации
- Двойные пробелы в любом поле
- Пробел перед знаком препинания (пробел перед запятой, точкой, двоеточием)
- Точка в конце названия раздела или заголовка (не должно быть)
- Кавычки: должны быть «ёлочки», не "лапки" и не 'одинарные'

### Поля
- Пустые обязательные поля (пустая строка "" там где должно быть значение)
- Номер протокола: должен быть заполнен (кроме `conclusion` и `cover` — у них нет номера)
- Дата: проверь что формат правильный, месяц — в родительном падеже строчными (`апреля`)
- Должность исполнителя и представителя: не должна быть пустой

### Таблицы
- Числовые поля: не должны содержать буквы или символы кроме цифр и разделителя
- Классы условий труда: должны быть из допустимых значений (см. чеклист конкретного типа — наборы различаются)

## Шаг 3. Специфические проверки по типу документа

Открой и примени соответствующий чеклист (в нём — обязательные поля, формат числовых полей,
что подчёркивается и типографика именно этого типа):

- `cover` → `.claude/commands/check-cover.md`
- `intro` → `.claude/commands/check-intro.md`
- `coding` → `.claude/commands/check-coding.md`
- `meteo` → `.claude/commands/check-meteo.md`
- `lighting` → `.claude/commands/check-lighting.md`
- `emp` → `.claude/commands/check-emp.md`
- `noise` → `.claude/commands/check-noise.md`
- `summary` → `.claude/commands/check-summary.md`
- `heaviness` → `.claude/commands/check-heaviness.md`
- `tension` → `.claude/commands/check-tension.md`
- `safety` → `.claude/commands/check-safety.md`
- `siz` → `.claude/commands/check-siz.md`
- `conclusion` → `.claude/commands/check-conclusion.md`

## Результат
Выведи список найденных проблем с указанием конкретного поля и значения.
Если проблем нет — скажи "Готово к отправке клиенту".
