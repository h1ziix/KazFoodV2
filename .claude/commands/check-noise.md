Чеклист проверки данных для документа **Шум** (`noise`, шаблон `noise-protocol.docx`).

Применяй ВМЕСТЕ с универсальными проверками типографики и полей из `check.md`.
Корень JSON: `protocol / customer / measurementDate / purpose / methodologyStandard / productStandard / representative / places[] / performer / director`.

## Обязательные поля (пустая строка = ошибка)
- `protocol.number / year / day / month / dateYear`
- `customer.name`, `customer.address`
- `measurementDate.day / month / year`
- `purpose`, `methodologyStandard`, `productStandard`, `representative`
- `performer.fullName`, `performer.position`, `director.fullName`
- В каждом `places[]`: `name` и минимум одно измерение
- В каждом измерении: `pointNumber`, `place`, `allowed`
- `measured` — **необязательное** (вписывается после синхронизации), пустое допустимо
- `octaves.*`, `character.*`, `time`, `ppePresent/ppeAbsent`, `sourceStationary/sourceNonStationary` — служебные, заполняются по умолчанию или в самом .docx; обычно пустые/`"+"` — это норма

## Формат числовых полей (всё — строки)
- `measured` — десятичный разделитель **запятая**: `"45,4"`, `"56,3"`. Точка — ошибка.
- `allowed` — целое в строке: `"50"`, `"60"`, `"70"`. Внутри только цифры.
- Октавные полосы `octaves.hz31…hz4000` — строки, чаще пустые (вносятся вручную в .docx).
- `rowNumber` / `places[].number` — целые положительные; `pointNumber` вида `"1т"`, сквозная нумерация без пропусков.

## Что должно быть подчёркнуто
Вставляемые значения в готовом .docx:
- `protocol.number`;
- наименование и адрес заказчика;
- даты;
- ФИО представителя и исполнителя.

## Типографика этого документа
- Месяцы — родительный падеж, строчными (`апреля`).
- Названия мест — без точки в конце, тире «–» с пробелами.
- `protocol.year` ≠ `measurementDate.year` допустимо — проверь корректность обоих.
- `customer.name` — в «ёлочках».

## Результат
Список найденных проблем: поле → значение → что не так. Если проблем нет — «Готово к отправке клиенту».
