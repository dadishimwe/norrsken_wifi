/** Guest places. C is classroom, L is level: C2L3 is Classroom 2, level 3. `house` is the universal QR only. */
export const ZONES = [
  { id: "house", label: "Norrsken House", floor: null, kind: "common", sort: 0 },
  { id: "reception", label: "Reception", floor: null, kind: "common", sort: 10 },
  { id: "ground", label: "Ground", floor: null, kind: "common", sort: 20 },
  { id: "c1", label: "C1", floor: null, kind: "classroom", sort: 30 },
  { id: "c2l1", label: "C2L1", floor: null, kind: "classroom", sort: 40 },
  { id: "c2l2", label: "C2L2", floor: null, kind: "classroom", sort: 50 },
  { id: "c2l3", label: "C2L3", floor: null, kind: "classroom", sort: 60 },
  { id: "c2l4", label: "C2L4", floor: null, kind: "classroom", sort: 70 },
  { id: "c2l5", label: "C2L5", floor: null, kind: "classroom", sort: 80 },
  { id: "c3", label: "C3", floor: null, kind: "classroom", sort: 90 },
  { id: "c4", label: "C4", floor: null, kind: "classroom", sort: 100 },
  { id: "c5", label: "C5", floor: null, kind: "classroom", sort: 110 },
  { id: "not-sure", label: "Not sure", floor: null, kind: "common", sort: 120 },
] as const;

/** Placeholder zones from the first seed. Removed when unused; turned off when a report still points at them. */
export const LEGACY_ZONE_IDS = [
  "l1-reception",
  "l1-cafe",
  "l1-event",
  "l2-west-desks",
  "l2-east-desks",
  "l2-booth-01",
  "l2-booth-02",
  "l2-booth-03",
  "l3-north-desks",
  "l3-south-desks",
] as const;
