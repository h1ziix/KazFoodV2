Чеклист проверки данных для документа **Сводный протокол** (`summary`, шаблон `summary-protocol.docx`).

Применяй ВМЕСТЕ с универсальными проверками типографики и полей из `check.md`.
Корень JSON: `protocol / customer / measurementLocation / measurementDate / roomDescription / collectiveProtection / equipment / professionsList / measuringTools[] / productStandard / conditions / places[] / performer / director`.
Внутри `places[].workplaces[]` лежат `factors[]` — трёхуровневая структура (раздел → рабочее место → факторы).

## Обязательные поля (пустая строка = ошибка)
- `protocol.number / year / day / month / dateYear`
- `customer.name`, `customer.address`
- `measurementLocation`, `roomDescription`, `collectiveProtection`, `equipment`, `professionsList`, `productStandard`
- `measurementDate.day / month / year`
- `conditions.temperature`, `conditions.humidity`, `conditions.pressure`
- Минимум один `measuringTools[]`, в каждом: `name`, `certificate`, `verificationDate`
- Минимум один `places[]`, в каждом: `name` и минимум одно рабочее место
- В каждом рабочем месте: `code`, `profession` (список `factors` может быть пустым)
- В каждом факторе: `name` (поля `method / norm / actual` могут быть пустыми)
- `performer.fullName/position`, `director.fullName/position`

## Формат числовых полей
- `classValue` фактора — из набора **`""`, `"2"`, `"3.1"`, `"3.2"`, `"3.3"`, `"3.4"`, `"4"`** (разделитель — **точка**). Пустая строка допустима (фактор без оценки).
- **Единый десятичный разделитель.** В исходном примере данные непоследовательны: шум указан через точку (`"45.4"`), а нормы — через запятую (`"2,5"`), температура — через запятую (`"23,5"`). Это частая ошибка: приведи ВСЕ `actual`/`norm` к одному разделителю (по конвенции — запятая).
- `actual` = `"-"` означает «фактор не оценивался» (например, выездная работа) — это валидно.
- `count` рабочего места — целое ≥ 0.
- `code` — формат `01 NNN NNN` с одиночными пробелами.
- `conditions.temperature/humidity/pressure` — числовые строки (`"16"`, `"52"`, `"694"`).
- `measuringTools[].rowNumber`, `places[].number` — целые положительные.

## Что должно быть подчёркнуто
Вставляемые значения в готовом .docx:
- `protocol.number`;
- наименование и адрес заказчика;
- даты;
- ФИО и должности исполнителя и руководителя.

## Типографика этого документа
- `verificationDate` — диапазон дат вида `"20.05.2025 г.-20.05.2026 г."`; следи за единым разделителем диапазона (в примере встречается и `"-"`, и `" – "`) и за точкой после «г».
- `professionsList` — перечисление через запятую; типичные ошибки — двойные пробелы и **пробел перед запятой** (`"директор ,"`).
- Названия факторов несут единицы: `"Освещение, лк"`, `"Температура, ºС"` (знак градуса `º` + кириллическая `С`), `"Шум, дБа"`.
- `name` приборов — точные заводские/сертификатные номера, не трогать.
- Месяц — родительный падеж, строчными. `customer.name` — в «ёлочках».

## Результат
Список найденных проблем: поле → значение → что не так. Если проблем нет — «Готово к отправке клиенту».
