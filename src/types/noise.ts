export interface NoiseOctaveBands {
  hz31: string;
  hz63: string;
  hz125: string;
  hz250: string;
  hz500: string;
  hz1000: string;
  hz2000: string;
  hz4000: string;
}

export interface NoiseCharacter {
  broadStationary: string;
  broadNonStationary: string;
  broadOscillating: string;
  broadImpulse: string;
  tonalStationary: string;
  tonalNonStationary: string;
  tonalOscillating: string;
  tonalImpulse: string;
}

export interface NoiseMeasurement {
  /** Стабильный id строки кодировки (CodingRow.id) — первичный ключ матчинга
   *  при синхронизации. Легаси-строки без него матчатся по коду/имени. */
  codingRowId?: string;
  /** Код рабочего места из кодировки — отображаемое производное значение,
   *  обновляется при синхронизации. */
  code: string;
  rowNumber: number;
  pointNumber: string;
  place: string;
  time: string;
  ppePresent: string;
  ppeAbsent: string;
  sourceStationary: string;
  sourceNonStationary: string;
  octaves: NoiseOctaveBands;
  character: NoiseCharacter;
  measured: string;
  allowed: string;
}

export interface NoisePlace {
  number: number;
  name: string;
  measurements: NoiseMeasurement[];
}

export interface NoiseProtocol {
  protocol: {
    number: string;
    year: string;
    day: string;
    month: string;
    dateYear: string;
  };
  customer: {
    name: string;
    address: string;
  };
  measurementDate: {
    day: string;
    month: string;
    year: string;
  };
  purpose: string;
  methodologyStandard: string;
  productStandard: string;
  representative: string;
  places: NoisePlace[];
  performer: {
    fullName: string;
    position: string;
  };
  director: {
    fullName: string;
  };
}
