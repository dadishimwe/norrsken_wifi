import pg from "pg";
import { LEGACY_ZONE_IDS, ZONES } from "./zones-data.js";

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    for (const z of ZONES) {
      await client.query(
        `
        insert into zone (id, label, floor, kind, active, sort)
        values ($1, $2, $3, $4, true, $5)
        on conflict (id) do update set
          label = excluded.label,
          floor = excluded.floor,
          kind = excluded.kind,
          sort = excluded.sort
        `,
        [z.id, z.label, z.floor, z.kind, z.sort],
      );
    }
    await client.query(
      `
      delete from zone z
      where z.id = any($1::text[])
        and not exists (select 1 from report r where r.zone_id = z.id)
      `,
      [LEGACY_ZONE_IDS],
    );
    await client.query(`update zone set active = false where id = any($1::text[])`, [
      LEGACY_ZONE_IDS,
    ]);
    console.log(`Seeded ${ZONES.length} zones`);
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
