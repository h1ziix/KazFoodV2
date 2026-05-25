export interface EmpRange {
  name: string;
  distance: string;
  height: string;
  time: string;
  electricMeasured: string;
  electricAllowed: string;
  magneticMeasured: string;
  magneticAllowed: string;
}

export interface EmpMeasurement {
  rowNumber: number;
  pointNumber: string;
  place: string;
  range1: EmpRange;
  range2: EmpRange;
}

export interface EmpPlace {
  number: number;
  name: string;
}

export interface EmpProtocol {
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
  places: EmpPlace[];
  emp_measurements: EmpMeasurement[];
  performer: {
    fullName: string;
    position: string;
  };
  director: {
    fullName: string;
  };
}
