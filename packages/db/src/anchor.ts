import type { Pool } from "pg";

function utcDayString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function anchorHashChain(db: Pool): Promise<Buffer | null> {
  const { rows } = await db.query<{ row_hash: Buffer }>(
    "select row_hash from report where row_hash is not null order by created_at desc, id desc limit 1",
  );
  const head = rows[0]?.row_hash ?? null;
  if (!head) return null;

  const day = utcDayString();
  await db.query(
    `
    insert into hash_anchor (day, head) values ($1::date, $2)
    on conflict (day) do update set head = excluded.head
    `,
    [day, head],
  );
  return head;
}
