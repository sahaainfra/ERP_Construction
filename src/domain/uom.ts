// Units of measure seeds from Part 00 Annex B9. Conversions go through the UOM master only.
// Item-specific conversions (bag to kg, m³ to MT by density) are item attributes with versions (Part 21),
// not constants here.

export type UomDimension =
  | "count"
  | "mass"
  | "length"
  | "area"
  | "volume"
  | "time"
  | "transport"
  | "packaging"
  | "lump-sum";

export interface UnitOfMeasure {
  code: string;
  name: string;
  dimension: UomDimension;
}

export const UNITS_OF_MEASURE: readonly UnitOfMeasure[] = [
  { code: "nos", name: "Numbers", dimension: "count" },
  { code: "set", name: "Set", dimension: "count" },
  { code: "pair", name: "Pair", dimension: "count" },
  { code: "kg", name: "Kilogram", dimension: "mass" },
  { code: "MT", name: "Metric tonne", dimension: "mass" },
  { code: "quintal", name: "Quintal", dimension: "mass" },
  { code: "m", name: "Metre", dimension: "length" },
  { code: "RMT", name: "Running metre", dimension: "length" },
  { code: "km", name: "Kilometre", dimension: "length" },
  { code: "m2", name: "Square metre", dimension: "area" },
  { code: "sqft", name: "Square foot", dimension: "area" },
  { code: "m3", name: "Cubic metre", dimension: "volume" },
  { code: "cft", name: "Cubic foot", dimension: "volume" },
  { code: "brass", name: "Brass (regional)", dimension: "volume" },
  { code: "litre", name: "Litre", dimension: "volume" },
  { code: "kL", name: "Kilolitre", dimension: "volume" },
  { code: "hour", name: "Hour", dimension: "time" },
  { code: "day", name: "Day", dimension: "time" },
  { code: "month", name: "Month", dimension: "time" },
  { code: "trip", name: "Trip", dimension: "transport" },
  { code: "km-run", name: "Km run", dimension: "transport" },
  { code: "m3-km", name: "Cubic metre-kilometre (lead)", dimension: "transport" },
  { code: "bag", name: "Bag (cement, 50 kg)", dimension: "packaging" },
  { code: "LS", name: "Lump sum", dimension: "lump-sum" },
];

/** The one fixed conversion Annex B9 states: 1 brass = 100 cubic feet. Regional, so it is labelled as such. */
export const BRASS_TO_CFT = { factor: 100, regional: true } as const;

export function findUnit(code: string): UnitOfMeasure {
  const unit = UNITS_OF_MEASURE.find((u) => u.code === code);
  if (!unit) throw new RangeError(`Unknown unit of measure ${code}`);
  return unit;
}
