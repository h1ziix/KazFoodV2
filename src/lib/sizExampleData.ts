import type {
  SizProtocol,
  SizRow,
  SizSection,
} from "@/types/siz";

const ADMIN_NORM_TEXT =
  '- не предусмотрено, согласно «Нормам выдачи специальной одежды и других средств индивидуальной защиты работникам организаций различных видов экономической деятельности», утвержденных Приказом Министра здравоохранения и социального развития РК от 8 декабря 2015 года № 943';

const PROD_NORM_TEXT = "Жилет, Рубашка, Головной убор, ботинки";

function adminRow(code: string, position: string): SizRow {
  return {
    code,
    position,
    count: 1,
    normItems: ADMIN_NORM_TEXT,
    issuedFact: "-",
    certificate: "-",
    assessment: "-",
    note: "-",
  };
}

function prodRow(code: string, position: string): SizRow {
  return {
    code,
    position,
    count: 1,
    normItems: PROD_NORM_TEXT,
    issuedFact: "Да",
    certificate: "В наличии",
    assessment: "Обеспечен",
    note: "-",
  };
}

const adminSection: SizSection = {
  number: 1,
  title: "1. Администрация – 3 рабочих мест",
  rows: [
    adminRow("01 001 001", "Директор"),
    adminRow("01 001 002", "Управляющий производством"),
    adminRow("01 001 003", "Бухгалтер"),
    adminRow("01 001 004", "Коммерческий директор"),
    adminRow("01 001 005", "Технический директор"),
    adminRow("01 001 006", "Менеджер по продажам"),
    adminRow("01 001 007", "Менеджер по снабжению"),
    adminRow("01 001 008", "Главный механик"),
    adminRow("01 001 009", "Главный энергетик"),
    adminRow("01 001 010", "Специалист по кадровым вопросам"),
    adminRow("01 001 011", "Начальник службы безопасности"),
    adminRow("01 001 012", "Специалист по безопасности и охране труда"),
    adminRow("01 001 013", "Технолог оператор"),
  ],
};

const productionSection: SizSection = {
  number: 2,
  title: "2. Производственный персонал",
  rows: [
    prodRow("01 002 014", "Технолог оператор"),
    prodRow("01 002 015", "Бригадир ремонтно-строительной бригады"),
    prodRow("01 002 016", "Бригадир технической бригады"),
    prodRow("01 002 017", "Бригадир цеха выращивания и хранения"),
    prodRow("01 002 018", "Электро слесарь"),
    prodRow("01 002 019", "Водитель экспедитор"),
    prodRow("01 002 020", "Лаборант"),
    prodRow("01 002 021", "Поливщик"),
    prodRow("01 002 022", "Сборщик"),
    prodRow("01 002 023", "Фасовщик"),
    prodRow("01 002 024", "Грузчик"),
    prodRow("01 002 025", "Тракторист"),
    prodRow("01 002 026", "Разнорабочий"),
    prodRow("01 002 027", "Слесарь"),
    prodRow("01 002 028", "Сторож"),
    prodRow("01 002 029", "Шеф повар"),
    prodRow("01 002 030", "Посудомойщица"),
    prodRow("01 002 031", "Прачка"),
  ],
};

export const sizExample: SizProtocol = {
  protocol: { number: "1" },
  customer: {
    name: "",
    address: "",
  },
  measurementPlace: "",
  measurementDate: {
    day: "10",
    month: "апреля",
    year: "2026",
  },
  sections: [adminSection, productionSection],
  performer: {
    fullName: "",
    position: "",
  },
  representative: {
    fullName: "Богачев А.И.",
    position: "Начальник по БиОТ",
  },
};
