import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import {
  createOpsSession,
  createOpsUser,
  getOpsUserByUsername,
  listOpsUsers,
  resolveOpsSession,
  revokeOpsSession,
  setOpsUserActive,
  setOpsUserPassword,
  verifyPassword,
  type OpsUser,
} from "@norrsken/db";
import { z } from "zod";
import type { Env } from "./env.js";
import { HttpError } from "./reports-service.js";

const COOKIE = "norrsken_ops_session";

declare module "fastify" {
  interface FastifyRequest {
    opsUser?: OpsUser;
  }
}

function readSessionToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice(7).trim() || null;
  }
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function setSessionCookie(reply: FastifyReply, token: string, env: Env) {
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header(
    "set-cookie",
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${12 * 3600}${secure}`,
  );
}

function clearSessionCookie(reply: FastifyReply, env: Env) {
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header(
    "set-cookie",
    `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  );
}

async function requireOps(
  req: FastifyRequest,
  _reply: FastifyReply,
  db: Pool,
): Promise<OpsUser> {
  const token = readSessionToken(req);
  if (!token) throw new HttpError(401, "unauthorized");
  const user = await resolveOpsSession(db, token);
  if (!user) throw new HttpError(401, "unauthorized");
  req.opsUser = user;
  return user;
}

function requireAdmin(user: OpsUser) {
  if (user.role !== "admin") throw new HttpError(403, "forbidden");
}

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

const createUserSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9._-]+$/i, "username: letters, numbers, . _ -"),
  display_name: z.string().min(1).max(80),
  password: z.string().min(12).max(128),
  role: z.enum(["admin", "viewer"]).default("viewer"),
});

export async function registerOpsRoutes(app: FastifyInstance, db: Pool, env: Env) {
  app.post("/api/ops/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });

    const user = await getOpsUserByUsername(db, parsed.data.username);
    if (!user || !user.active || !verifyPassword(parsed.data.password, user.password_hash)) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const token = await createOpsSession(db, user.id);
    setSessionCookie(reply, token, env);
    return {
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
      },
    };
  });

  app.post("/api/ops/logout", async (req, reply) => {
    const token = readSessionToken(req);
    if (token) await revokeOpsSession(db, token);
    clearSessionCookie(reply, env);
    return { ok: true };
  });

  app.get("/api/ops/me", async (req, reply) => {
    try {
      const user = await requireOps(req, reply, db);
      return {
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          role: user.role,
        },
      };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/api/ops/users", async (req, reply) => {
    try {
      const me = await requireOps(req, reply, db);
      requireAdmin(me);
      const users = await listOpsUsers(db);
      return { users };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/api/ops/users", async (req, reply) => {
    try {
      const me = await requireOps(req, reply, db);
      requireAdmin(me);
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues.map((i) => i.message).join("; "),
        });
      }
      const user = await createOpsUser(db, {
        ...parsed.data,
        created_by: me.id,
      });
      return reply.code(201).send({ user });
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
        return reply.code(409).send({ error: "username_taken" });
      }
      throw err;
    }
  });

  app.patch("/api/ops/users/:id", async (req, reply) => {
    try {
      const me = await requireOps(req, reply, db);
      requireAdmin(me);
      const { id } = req.params as { id: string };
      const body = z
        .object({
          active: z.boolean().optional(),
          password: z.string().min(12).max(128).optional(),
        })
        .safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_body" });

      if (body.data.active === false && id === me.id) {
        return reply.code(400).send({ error: "cannot_deactivate_self" });
      }

      let user = null;
      if (typeof body.data.active === "boolean") {
        user = await setOpsUserActive(db, id, body.data.active);
      }
      if (body.data.password) {
        await setOpsUserPassword(db, id, body.data.password);
        user = user ?? (await listOpsUsers(db)).find((u) => u.id === id) ?? null;
      }
      if (!user) return reply.code(404).send({ error: "not_found" });
      return { user };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/api/ops/dashboard", async (req, reply) => {
    try {
      await requireOps(req, reply, db);

      const [kpi, zones, reports, incidents] = await Promise.all([
        db.query(`select * from v_kpi_daily`),
        db.query(`select * from v_zone_health`),
        db.query(`select * from v_recent_reports limit 50`),
        db.query(`select * from v_open_incidents`),
      ]);

      return {
        kpi: kpi.rows[0] ?? null,
        zones: zones.rows,
        reports: reports.rows,
        incidents: incidents.rows,
      };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
