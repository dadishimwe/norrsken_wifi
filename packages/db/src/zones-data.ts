export const ZONES = [
  { id: "l1-reception", label: "Level 1 · Reception", floor: "1", kind: "common", sort: 10 },
  { id: "l1-cafe", label: "Level 1 · Café", floor: "1", kind: "common", sort: 20 },
  { id: "l1-event", label: "Level 1 · Event space", floor: "1", kind: "event", sort: 30 },
  { id: "l2-west-desks", label: "Level 2 · West desks", floor: "2", kind: "area", sort: 40 },
  { id: "l2-east-desks", label: "Level 2 · East desks", floor: "2", kind: "area", sort: 50 },
  { id: "l2-booth-01", label: "Level 2 · Booth 1", floor: "2", kind: "booth", sort: 60 },
  { id: "l2-booth-02", label: "Level 2 · Booth 2", floor: "2", kind: "booth", sort: 70 },
  { id: "l2-booth-03", label: "Level 2 · Booth 3", floor: "2", kind: "booth", sort: 80 },
  { id: "l3-north-desks", label: "Level 3 · North desks", floor: "3", kind: "area", sort: 90 },
  { id: "l3-south-desks", label: "Level 3 · South desks", floor: "3", kind: "area", sort: 100 },
] as const;
