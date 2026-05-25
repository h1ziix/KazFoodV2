export interface LightingMeasurement {
  rowNumber: number;
  pointNumber: string;
  place: string;
  workCategory: string;
  lightingSystem: string;
  lightingType: string;
  measured: number;
  keo: string;
  allowed: number;
}

export interface LightingGroup {
  number: number;
  name: string;
  measurements: LightingMeasurement[];
}

export interface LightingPlace {
  number: number;
  name: string;
}

export interface LightingProtocol {
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
  roomDescription: string;
  conditions: {
    t: string;
    h: string;
    p: string;
  };
  places: LightingPlace[];
  groups: LightingGroup[];
  performer: {
    fullName: string;
    position: string;
  };
  director: {
    fullName: string;
  };
}
