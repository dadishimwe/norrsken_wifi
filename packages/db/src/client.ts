import pg from "pg";

export type Db = pg.Pool;

export function createPool(connectionString: string): Db {
  return new pg.Pool({
    connectionString,
    max: 10,
    // Never log connection strings with credentials in application code paths
  });
}

export type ZoneRow = {
  id: string;
  label: string;
  floor: string | null;
  kind: string;
  active: boolean;
  sort: number;
};

export type ReportRow = {
  id: string;
  created_at: Date;
  channel: string;
  zone_id: string;
  zone_source: string;
  symptoms: string[];
  apps: string[];
  when_bucket: string;
  occurred_at: Date | null;
  wifi_context: string;
  clarifiers: Record<string, unknown>;
  device_class: string | null;
  fill_ms: number | null;
  actor_hash: Buffer;
  weight: number;
  incident_id: string | null;
  prev_hash: Buffer | null;
  row_hash: Buffer | null;
};
