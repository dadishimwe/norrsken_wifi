import { createHash } from "node:crypto";

/**
 * Canonical JSON: sorted object keys, no whitespace.
 * Arrays keep order. Dates → ISO strings. Buffers → hex.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (value instanceof Date) return value.toISOString();
    if (Buffer.isBuffer(value)) return value.toString("hex");
    return value;
  }
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    const v = obj[k];
    if (v !== undefined) out[k] = sortKeys(v);
  }
  return out;
}

/** Fields included in the hash chain (exclude prev_hash / row_hash themselves). */
export type HashableReport = {
  id: string;
  created_at: Date | string;
  channel: string;
  zone_id: string;
  zone_source: string;
  symptoms: string[];
  apps: string[];
  when_bucket: string;
  occurred_at: Date | string | null;
  wifi_context: string;
  clarifiers: unknown;
  device_class: string | null;
  fill_ms: number | null;
  actor_hash: Buffer | string;
  weight: number;
  incident_id: string | null;
};

export function computeRowHash(prevHash: Buffer | null, row: HashableReport): Buffer {
  const payload = canonicalJson({
    ...row,
    actor_hash: Buffer.isBuffer(row.actor_hash)
      ? row.actor_hash.toString("hex")
      : row.actor_hash,
    created_at:
      row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    occurred_at:
      row.occurred_at instanceof Date
        ? row.occurred_at.toISOString()
        : row.occurred_at,
  });
  const h = createHash("sha256");
  if (prevHash) h.update(prevHash);
  h.update(payload, "utf8");
  return h.digest();
}
