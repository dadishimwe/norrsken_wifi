import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return url;
}

async function ensureMigrationsTable(client: pg.Client) {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

function parseUpSql(raw: string): string {
  const upMatch = raw.match(/-- migrate:up\s*([\s\S]*?)(?:-- migrate:down|$)/i);
  if (!upMatch?.[1]) throw new Error("Migration missing -- migrate:up section");
  // schema_migrations is created by the runner; strip from migration body if present
  return upMatch[1]
    .replace(
      /create table schema_migrations\s*\([\s\S]*?\);\s*/i,
      "",
    )
    .trim();
}

async function migrate() {
  const reset = process.argv.includes("--reset");
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();

  try {
    if (reset) {
      await client.query(`
        drop view if exists v_zone_report_totals cascade;
        drop view if exists v_wifi_frequency cascade;
        drop view if exists v_symptoms_frequency cascade;
        drop view if exists v_apps_frequency cascade;
        drop view if exists v_reports_per_day cascade;
        drop view if exists v_reports_full cascade;
        drop view if exists v_kpi_daily cascade;
        drop view if exists v_open_incidents cascade;
        drop view if exists v_recent_reports cascade;
        drop view if exists v_zone_health cascade;
        drop table if exists ops_session cascade;
        drop table if exists ops_user cascade;
        drop table if exists hash_anchor cascade;
        drop table if exists session_state cascade;
        drop table if exists rate_bucket cascade;
        drop table if exists daily_salt cascade;
        drop table if exists report cascade;
        drop table if exists incident cascade;
        drop table if exists zone cascade;
        drop table if exists schema_migrations cascade;
      `);
      console.log("Reset: dropped all tables");
    }

    await ensureMigrationsTable(client);

    const migrationsDir = path.join(__dirname, "..", "migrations");
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const { rows } = await client.query(
        "select 1 from schema_migrations where version = $1",
        [version],
      );
      if (rows.length > 0) {
        console.log(`skip ${version}`);
        continue;
      }

      const raw = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      const sql = parseUpSql(raw);

      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (version) values ($1)", [version]);
        await client.query("commit");
        console.log(`applied ${version}`);
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
    }
  } finally {
    await client.end();
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
