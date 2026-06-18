Чеклист проверки данных для документа **Освещенность** (`lighting`, шаблон `lighting-protocol.docx`).

Применяй ВМЕСТЕ с универсальными проверками типографики и полей из `check.md`.
Корень JSON: `protocol / customer / measurementDate / purpose / methodologyStandard / productStandard / representative / roomDescription / conditions / places[] / performer / director`.

## Обязательные поля (пустая строка = ошибка)
- `protocol.number`, `protocol.year`, `protocol.day`, `protocol.month`, `protocol.dateYear`
- `customer.name`, `customer.address`
- `measurementDate.day`, `measurementDate.month`, `measurementDate.year`
- `purpose`, `methodologyStandard`, `productStandard`, `representative`, `roomDescription`
- `conditions.t`, `conditions.h`, `conditions.p`
- `performer.fullName`, `performer.position`, `director.fullName`
- В каждом `places[]`: `name` и минимум одно `measurements[]`
- В каждом измерении: `pointNumber`, `place`, `workCategory`, `lightingSystem`, `lightingType`
  (`code` и `keo` могут быть пустыми/«-»)

## Формат числовых полей
- `measured` и `allowed` — это **числа, а не строки**: `461`, `300` (без кавычек, без запятой/точки).
  Если в JSON стоит `"461"` в кавычках или `461,0` — это ошибка типа.
- `conditions.t / h / p` — числовые **строки** (`"16"`, `"52"`, `"694"`).
- `keo` — строка; когда не применяется, ставится `"-"`, а не пусто и не `0`.
- `rowNumber` и `places[].number` — целые положительные числа.
- `workCategory` — код вида `"А-1"`, `"Б-2"` (кириллица + дефис + цифра).
- `pointNumber` — вида `"1т"` (число + кириллическая «т»), сквозная нумерация по всем местам без пропусков.

## Что должно быть подчёркнуто
В готовом .docx подчёркиваются вставляемые значения — проверь, что они заполнены, без двойных пробелов и опечаток:
- номер протокола `protocol.number`;
- наименование и адрес заказчика;
- даты (день/месяц/год);
- ФИО представителя и исполнителя.

## Типографика этого документа
- `measurementDate.month` и `protocol.month` — в **родительном падеже, строчными**: `апреля`, не `Апрель`.
- Год в номере протокола (`protocol.year`) и год измерений (`measurementDate.year` / `dateYear`) — это РАЗНЫЕ поля и могут отличаться; убедись, что значения соответствуют реальным.
- Названия мест/разделов — без точки в конце; тире в них «–» с пробелами (`Административно – управленческий персонал`).
- `customer.name` — в «ёлочках», если это организация.
- `lightingSystem` / `lightingType` — текст без точки в конце.

## Результат
Список найденных проблем: поле → значение → что не так. Если проблем нет — «Готово к отправке клиенту».
