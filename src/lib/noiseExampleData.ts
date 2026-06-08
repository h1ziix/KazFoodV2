import type {
  NoiseCharacter,
  NoiseMeasurement,
  NoiseOctaveBands,
  NoiseProtocol,
} from "@/types/noise";

const EMPTY_OCTAVES: NoiseOctaveBands = {
  hz31: "",
  hz63: "",
  hz125: "",
  hz250: "",
  hz500: "",
  hz1000: "",
  hz2000: "",
  hz4000: "",
};

const EMPTY_CHARACTER: NoiseCharacter = {
  broadStationary: "",
  broadNonStationary: "",
  broadOscillating: "",
  broadImpulse: "",
  tonalStationary: "",
  tonalNonStationary: "",
  tonalOscillating: "",
  tonalImpulse: "",
};

function m(
  rowNumber: number,
  pointNumber: string,
  place: string,
  measured: string,
  allowed: string,
): NoiseMeasurement {
  return {
    code: "",
    rowNumber,
    pointNumber,
    place,
    time: "7-8",
    ppePresent: "+",
    ppeAbsent: "",
    sourceStationary: "+",
    sourceNonStationary: "",
    octaves: { ...EMPTY_OCTAVES },
    character: { ...EMPTY_CHARACTER },
    measured,
    allowed,
  };
}

export const noiseExample: NoiseProtocol = {
  protocol: {
    number: "1004-ШУМ",
    year: "2026",
    day: "10",
    month: "апреля",
    dateYear: "2026",
  },
  customer: {
    name: "",
    address: "",
  },
  measurementDate: {
    day: "10",
    month: "апреля",
    year: "2026",
  },
  purpose: "Аттестация рабочих мест",
  methodologyStandard: "ГОСТ ISO 9612-2016",
  productStandard:
    "Приказ Министра здравоохранения Республики Казахстан от 16 февраля 2022 года № ҚР ДСМ-15. «Об утверждении гигиенических нормативов к физическим факторам, оказывающим воздействие на человека»",
  representative: "Богачев А.И.",
  places: [
    {
      number: 1,
      name: "Административно – управленческий персонал",
      measurements: [
        m(1, "1т", "Директор", "45,4", "50"),
        m(2, "2т", "Управляющий производством", "46,3", "50"),
        m(3, "3т", "Бухгалтер", "44,0", "50"),
        m(4, "4т", "Коммерческий директор", "45,4", "50"),
        m(5, "5т", "Технический директор", "44,3", "50"),
        m(6, "6т", "Менеджер по продажам", "47,0", "50"),
        m(7, "7т", "Менеджер по продажам", "48,8", "50"),
        m(8, "8т", "Менеджер по снабжению", "47,4", "50"),
        m(9, "9т", "Главный механик", "56,3", "50"),
        m(10, "10т", "Главный энергетик", "56,6", "60"),
        m(11, "11т", "Специалист по кадровым вопросам", "55,4", "60"),
        m(12, "12т", "Начальник службы безопасности", "55,8", "60"),
        m(13, "13т", "Специалист по безопасности и охране труда", "48,3", "50"),
        m(14, "14т", "Технолог оператор", "56,6", "60"),
      ],
    },
    {
      number: 2,
      name: "Производственный персонал",
      measurements: [
        m(15, "15т", "Технолог оператор", "66,6", "70"),
        m(16, "16т", "Бригадир ремонтно-строительной бригады", "67,7", "70"),
        m(17, "17т", "Бригадир технической бригады", "65,3", "70"),
        m(18, "18т", "Бригадир по выращиванию и хранению", "63,6", "70"),
        m(19, "19т", "Электрик слесарь", "62,5", "70"),
        m(20, "20т", "Электрик слесарь", "64,6", "70"),
        m(21, "21т", "Электрик слесарь", "62,6", "70"),
        m(22, "22т", "Водитель экспедитор", "63,6", "70"),
        m(23, "23т", "Водитель экспедитор", "60,6", "70"),
        m(24, "24т", "Водитель экспедитор", "60,5", "70"),
        m(25, "25т", "Кладовщик", "56,6", "70"),
      ],
    },
  ],
  performer: {
    fullName: "",
    position: "",
  },
  director: {
    fullName: "",
  },
};
