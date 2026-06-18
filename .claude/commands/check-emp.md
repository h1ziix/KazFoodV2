Чеклист проверки данных для документа **ЭМП** (`emp`, шаблон `emp-protocol.docx`).

Применяй ВМЕСТЕ с универсальными проверками типографики и полей из `check.md`.
Корень JSON: `protocol / customer / measurementDate / purpose / methodologyStandard / productStandard / representative / places[] / performer / director`.
Каждое измерение содержит два диапазона: `range1` и `range2`.

## Обязательные поля (пустая строка = ошибка)
- `protocol.number / year / day / month / dateYear`
- `customer.name`, `customer.address`
- `measurementDate.day / month / year`
- `purpose`, `methodologyStandard`, `productStandard`, `representative`
- `performer.fullName`, `performer.position`, `director.fullName`
- В каждом `places[]`: `name` и минимум одно измерение
- В каждом измерении: `pointNumber`, `place`
- В `range1` и `range2`: `name`, `distance`, `height`, `time`, `electricAllowed`, `magneticAllowed`
- `electricMeasured` и `magneticMeasured` — **необязательные** (пользователь вписывает после синхронизации); пустые допустимы

## Формат числовых полей (всё — строки)
- Десятичный разделитель — **запятая**, не точка: `"12,5"`, `"2,5"`, `"0,5"`, `"1,5"`. Точка (`"12.5"`) — ошибка.
- Нормативы по умолчанию: `electricAllowed` = `"25"` / `"2,5"`, `magneticAllowed` = `"250"` / `"25"`.
- `distance` `"0,5"`, `height` `"1,5"`, `time` `"8"`.
- Внутри числовых полей не должно быть единиц измерения, букв и лишних пробелов.
- `rowNumber` / `places[].number` — целые положительные числа; `pointNumber` вида `"1т"`, сквозная нумерация.

## Что должно быть подчёркнуто
Вставляемые значения в готовом .docx — проверь, что заполнены и без опечаток:
- `protocol.number`;
- наименование и адрес заказчика;
- даты;
- ФИО представителя и исполнителя.

## Типографика этого документа
- `range1.name` / `range2.name` — диапазоны частот с тире-«–» и пробелами: `"5 Гц – 2 кГц"`, `"2 кГц – 400 кГц"`.
- Месяцы — родительный падеж, строчными (`апреля`).
- `protocol.year` и `measurementDate.year` — разные поля, могут не совпадать; проверь корректность.
- `customer.name` — в «ёлочках».

## Результат
Список найденных проблем: поле → значение → что не так. Если проблем нет — «Готово к отправке клиенту».
