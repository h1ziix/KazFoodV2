Чеклист проверки данных для документа **Микроклимат** (`meteo`, шаблон `meteo-protocol.docx`).

Применяй ВМЕСТЕ с универсальными проверками типографики и полей из `check.md`.
Корень JSON: `protocol / customer / measurementDate / purpose / methodologyStandard / productStandard / representative / roomDescription / conditions / places[] / performer / director`.

## Обязательные поля (пустая строка = ошибка)
- `protocol.number / year / day / month / dateYear`
- `customer.name`, `customer.address`
- `measurementDate.day / month / year`
- `purpose`, `methodologyStandard`, `productStandard`, `representative`, `roomDescription`
- `conditions.t`, `conditions.h`, `conditions.p`
- `performer.fullName`, `performer.position`, `director.fullName`
- В каждом `places[]`: `name` и минимум одно измерение
- В каждом измерении: `pointNumber`, `place`, `workCategory`, `timeOfDay`
- `tempMeasured/tempAllowed`, `humidityMeasured/humidityAllowed`, `airSpeedMeasured/airSpeedAllowed`, `pressure` — **необязательные**; пустые или `"-"` допустимы

## Формат числовых полей (всё — строки)
- Измеренная температура/влажность — десятичный разделитель **запятая**: `"23,5"`, `"21,0"`. Точка — ошибка.
- Допустимые значения часто заданы диапазоном через дефис: `"21-28"`, `"16-27"` (без пробелов внутри диапазона).
- Когда фактор не оценивается — ставится `"-"` (а не пусто и не `0`): типично `airSpeedMeasured/Allowed = "-"`.
- `conditions.t / h / p` и `pressure` — числовые строки (`"16"`, `"52"`, `"694"`).
- `workCategory` — категория работ римской цифрой + кириллица: `"Iб"`, `"IIб"`.
- `timeOfDay` — текст (`"день"`). `pointNumber` вида `"1т"`, сквозная нумерация.

## Что должно быть подчёркнуто
Вставляемые значения в готовом .docx:
- `protocol.number`;
- наименование и адрес заказчика;
- даты;
- ФИО представителя и исполнителя.

## Типографика этого документа
- Месяцы — родительный падеж, строчными (`апреля`).
- `roomDescription` — перечисление через запятую; в конце предложения точка допустима, но следи за двойными пробелами и пробелом перед запятой.
- Названия мест — тире «–» с пробелами, без точки в конце.
- `protocol.year` ≠ `measurementDate.year` допустимо — проверь корректность.
- `customer.name` — в «ёлочках».

## Результат
Список найденных проблем: поле → значение → что не так. Если проблем нет — «Готово к отправке клиенту».
