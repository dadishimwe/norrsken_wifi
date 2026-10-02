import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export type OpsRole = "super_admin" | "admin" | "viewer";
export type OpsCompany = "norrsken" | "zuba" | "dct";

export type OpsUser = {
  id: string;
  username: string;
  display_name: string;
  role: OpsRole;
  company: OpsCompany;
  active: boolean;
  assignable: boolean;
  created_at: Date;
  last_login_at: Date | null;
};

const OPS_USER_FIELDS =
  "id, username, display_name, role, company, active, assignable, created_at, last_login_at";

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string, salt?: Buffer): string {
  const s = salt ?? randomBytes(16);
  const hash = scryptSync(password, s, SCRYPT_KEYLEN);
  return `scrypt$${s.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt" || !parts[1] || !parts[2]) return false;
  const salt = Buffer.from(parts[1], "base64");
  const expected = Buffer.from(parts[2], "base64");
  const actual = scryptSync(password, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function hashSessionToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

export async function countOpsUsers(db: Pool): Promise<number> {
  const { rows } = await db.query<{ n: string }>("select count(*)::text as n from ops_user");
  return Number(rows[0]?.n ?? 0);
}

export async function createOpsUser(
  db: Pool | PoolClient,
  input: {
    username: string;
    display_name: string;
    password: string;
    role: OpsRole;
    company?: OpsCompany;
    assignable?: boolean;
    created_by?: string | null;
  },
): Promise<OpsUser> {
  const password_hash = hashPassword(input.password);
  const { rows } = await db.query<OpsUser>(
    `
    insert into ops_user (username, display_name, password_hash, role, company, assignable, created_by)
    values ($1, $2, $3, $4, $5, $6, $7)
    returning ${OPS_USER_FIELDS}
    `,
    [
      input.username.toLowerCase().trim(),
      input.display_name.trim(),
      password_hash,
      input.role,
      input.company ?? "norrsken",
      input.assignable === true,
      input.created_by ?? null,
    ],
  );
  const user = rows[0];
  if (!user) throw new Error("createOpsUser failed");
  return user;
}

export async function listOpsUsers(db: Pool): Promise<OpsUser[]> {
  const { rows } = await db.query<OpsUser>(
    `
    select ${OPS_USER_FIELDS}
    from ops_user
    order by created_at
    `,
  );
  return rows;
}

export async function getOpsUserByUsername(
  db: Pool,
  username: string,
): Promise<(OpsUser & { password_hash: string }) | null> {
  const { rows } = await db.query<OpsUser & { password_hash: string }>(
    `
    select ${OPS_USER_FIELDS}, password_hash
    from ops_user where username = $1
    `,
    [username.toLowerCase().trim()],
  );
  return rows[0] ?? null;
}

export async function getOpsUserById(db: Pool, id: string): Promise<OpsUser | null> {
  const { rows } = await db.query<OpsUser>(
    `
    select ${OPS_USER_FIELDS}
    from ops_user where id = $1
    `,
    [id],
  );
  return rows[0] ?? null;
}

export async function setOpsUserActive(
  db: Pool,
  id: string,
  active: boolean,
): Promise<OpsUser | null> {
  const { rows } = await db.query<OpsUser>(
    `
    update ops_user set active = $2
    where id = $1
    returning ${OPS_USER_FIELDS}
    `,
    [id, active],
  );
  return rows[0] ?? null;
}

export async function setOpsUserPassword(
  db: Pool,
  id: string,
  password: string,
): Promise<void> {
  await db.query(`update ops_user set password_hash = $2 where id = $1`, [
    id,
    hashPassword(password),
  ]);
}

export async function setOpsUserUsername(
  db: Pool,
  id: string,
  username: string,
): Promise<OpsUser | null> {
  const { rows } = await db.query<OpsUser>(
    `
    update ops_user set username = $2
    where id = $1
    returning ${OPS_USER_FIELDS}
    `,
    [id, username.toLowerCase().trim()],
  );
  return rows[0] ?? null;
}

export async function setOpsUserRole(
  db: Pool,
  id: string,
  role: OpsRole,
): Promise<OpsUser | null> {
  const { rows } = await db.query<OpsUser>(
    `
    update ops_user set role = $2
    where id = $1
    returning ${OPS_USER_FIELDS}
    `,
    [id, role],
  );
  return rows[0] ?? null;
}

export async function setOpsUserAssignable(
  db: Pool,
  id: string,
  assignable: boolean,
): Promise<OpsUser | null> {
  const { rows } = await db.query<OpsUser>(
    `
    update ops_user set assignable = $2
    where id = $1
    returning ${OPS_USER_FIELDS}
    `,
    [id, assignable],
  );
  return rows[0] ?? null;
}

export async function setOpsUserCompany(
  db: Pool,
  id: string,
  company: OpsCompany,
): Promise<OpsUser | null> {
  const { rows } = await db.query<OpsUser>(
    `
    update ops_user set company = $2
    where id = $1
    returning ${OPS_USER_FIELDS}
    `,
    [id, company],
  );
  return rows[0] ?? null;
}

export async function createOpsSession(
  db: Pool,
  userId: string,
  ttlHours = 12,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  await db.query(
    `
    insert into ops_session (user_id, token_hash, expires_at)
    values ($1, $2, now() + ($3 || ' hours')::interval)
    `,
    [userId, tokenHash, String(ttlHours)],
  );
  await db.query(`update ops_user set last_login_at = now() where id = $1`, [userId]);
  return token;
}

export async function revokeOpsSession(db: Pool, token: string): Promise<void> {
  const tokenHash = hashSessionToken(token);
  await db.query(
    `update ops_session set revoked_at = now() where token_hash = $1 and revoked_at is null`,
    [tokenHash],
  );
}

export async function resolveOpsSession(
  db: Pool,
  token: string,
): Promise<OpsUser | null> {
  const tokenHash = hashSessionToken(token);
  const { rows } = await db.query<OpsUser>(
    `
    select u.id, u.username, u.display_name, u.role, u.company, u.active, u.created_at, u.last_login_at
    from ops_session s
    join ops_user u on u.id = s.user_id
    where s.token_hash = $1
      and s.revoked_at is null
      and s.expires_at > now()
      and u.active = true
    `,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function purgeExpiredOpsSessions(db: Pool): Promise<number> {
  const { rowCount } = await db.query(
    `delete from ops_session where expires_at < now() or revoked_at is not null`,
  );
  return rowCount ?? 0;
}
