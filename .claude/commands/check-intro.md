Чеклист проверки данных для документа **Введение** (`intro`, шаблон `intro-protocol.docx`).

Применяй ВМЕСТЕ с универсальными проверками типографики и полей из `check.md`.
Корень JSON: `customer / measurementDate / workplaceCount / maleCount / femaleCount / performer / heavinessCounts / tensionCounts / safetyClassLabel`.

## Обязательные поля (пустая строка = ошибка)
- `customer.name`, `customer.city`, `customer.address`
- `measurementDate.day / month / year`
- `performer.organization`, `performer.addressRu`, `performer.addressKk`
- `performer.accreditation.number`, `performer.accreditation.dateRu`, `performer.accreditation.dateKk`
- `safetyClassLabel`

## Формат числовых полей
- `workplaceCount`, `maleCount`, `femaleCount` — **целые неотрицательные числа** (тип number, БЕЗ кавычек): `55`, а не `"55"`.
- `heavinessCounts` и `tensionCounts` — объекты `{ c1, c2, c31 }`, каждое — целое ≥ 0 (number).
- Логические сверки (типичные ошибки клиента):
  - `maleCount + femaleCount` должно равняться `workplaceCount`;
  - `heavinessCounts.c1 + c2 + c31` и `tensionCounts.c1 + c2 + c31` должны равняться `workplaceCount`.
- `accreditation.number` — строка-код (`"KZ.T.02.Е 1210"`), не число.

## Что должно быть подчёркнуто
Подтверждено по шаблону — в готовом .docx подчёркиваются:
- `customer.name` + `customer.address` (полужирный курсив с подчёркиванием);
- `workplaceCount`, `maleCount`, `femaleCount` (полужирное подчёркивание).
Проверь, что эти значения заполнены и без опечаток.

## Типографика этого документа
- ВАЖНО: `customer.name` подставляется в шаблон как `ТОО «{customer.name}»` — поэтому в JSON имя пишется **без** «ТОО» и **без** кавычек (только само название). Иначе получится `ТОО «ТОО «…»»`.
- `accreditation.dateRu` — полная русская дата (`"25 июля 2022 года"`), `dateKk` — казахская (`"2022 жылғы 25 шілдедегі"`).
- `measurementDate.month` — родительный падеж, строчными (`апреля`).
- `customer.city` — именительный падеж.

## Результат
Список найденных проблем: поле → значение → что не так. Если проблем нет — «Готово к отправке клиенту».
