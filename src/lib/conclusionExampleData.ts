import type { ConclusionProtocol } from "@/types/conclusion";

/**
 * Пример данных для документа №14 («Заключение / Отчёт»).
 * Состав строк зеркалит исходный DOCX:
 *   Освещение, Микроклимат, Шум — по 55 мест, класс «2».
 *   ЭМП — 14 мест, класс «2».
 *   Тяжесть труда / Напряжённость / Общая оценка — заголовок без
 *   распределения по классам, затем под-строки «мужчины / женщины».
 */
export const conclusionExample: ConclusionProtocol = {
  customer: {
    name: "ТОО «KazEcoFood»",
    address:
      "Алманиская обл, Карасайский район, село Кокозек, улица Несибели, 715",
  },
  measurementPlace:
    "Административное помещение, производственное помещение, складское помещение, автомастерская (грузовая), помещение лаборатории, кухня.",
  workplaceCodeNote: "см. стр. материала аттестации рабочих мест.",
  totalWorkplaces: "55 мест",
  measurementDate: { day: "10", month: "апреля", year: "2026" },
  rows: [
    { labelKk: "Жарықтандыру", labelRu: "Освещение", classValue: "2", count: 55 },
    { labelKk: "Микроклиматы", labelRu: "Микроклимат", classValue: "2", count: 55 },
    { labelKk: "Шу", labelRu: "Шум", classValue: "2", count: 55 },
    {
      labelKk:
        "Бейне-дисплей терминалы мен дербес компьютерде пайда болатын электромагниттік өрістер",
      labelRu:
        "Электромагнитные поля, создаваемые видео дисплейным терминалом и персональным компьютером",
      classValue: "2",
      count: 14,
    },
    {
      labelKk: "Жұмыс ауырлығы",
      labelRu: "Тяжесть труда:",
      classValue: "2",
      count: 55,
    },
    { labelKk: "", labelRu: "мужчины", classValue: "2", count: 30 },
    { labelKk: "", labelRu: "женщины", classValue: "2", count: 25 },
    {
      labelKk: "Жұмыс қауырттылығы",
      labelRu: "Напряженность труда:",
      classValue: "2",
      count: 55,
    },
    { labelKk: "", labelRu: "мужчины", classValue: "2", count: 30 },
    { labelKk: "", labelRu: "женщины", classValue: "2", count: 25 },
    {
      labelKk: "Еңбек жағдайларын жалпы бағасы",
      labelRu: "Общая оценка условий труда:",
      classValue: "2",
      count: 55,
    },
    { labelKk: "", labelRu: "мужчины", classValue: "2", count: 30 },
    { labelKk: "", labelRu: "женщины", classValue: "2", count: 25 },
  ],
  performer: {
    fullName: "Дьяченко И.С.",
    position: "Заведующий лабораторией",
  },
  laboratoryHead: {
    fullName: "Дьяченко В.Г.",
    position: "Генеральный директор",
  },
  representative: {
    fullName: "Богачев А.И.",
    position: "Начальник по БиОТ",
  },
};
