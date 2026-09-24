import { describe, expect, it } from "vitest";
import { computeRowHash, canonicalJson } from "@norrsken/db";

describe("hash chain", () => {
  it("canonicalJson sorts keys", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("computeRowHash is deterministic", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000001",
      created_at: "2026-01-01T00:00:00.000Z",
      channel: "qr",
      zone_id: "l2-west-desks",
      zone_source: "qr",
      symptoms: ["slow"],
      apps: [] as string[],
      when_bucket: "now",
      occurred_at: null,
      wifi_context: "unknown",
      clarifiers: {},
      device_class: "mobile",
      fill_ms: 2000,
      actor_hash: Buffer.from("abcd", "hex"),
      weight: 1,
      incident_id: null,
    };
    const a = computeRowHash(null, row);
    const b = computeRowHash(null, row);
    expect(a.equals(b)).toBe(true);

    const c = computeRowHash(a, row);
    expect(c.equals(a)).toBe(false);
  });
});
