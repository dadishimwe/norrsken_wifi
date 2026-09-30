import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import {
  createOpsSession,
  createOpsUser,
  createZone,
  countReportsForZone,
  deleteReport,
  deleteZone,
  getOpsUserById,
  getOpsUserByUsername,
  getZone,
  listAllZonesWithCounts,
  listOpsUsers,
  resolveOpsSession,
  revokeOpsSession,
  setOpsUserActive,
  setOpsUserPassword,
  setOpsUserUsername,
  updateZone,
  verifyPassword,
  type OpsUser,
} from "@norrsken/db";
import { z } from "zod";
import {
  APP_LABELS,
  SYMPTOM_LABELS,
  UNIVERSAL_ZONE_ID,
  ZONE_KINDS,
  formatClarifiersDisplay,
  isBrowserId,
} from "@norrsken/shared";
import type { Env } from "./env.js";
import { HttpError } from "./reports-service.js";
import { buildZoneQr } from "./qr-service.js";
import { postAlertsThread } from "./slack-alert.js";
import { slackLiveStatus } from "./slack/status.js";

function labelList(ids: unknown, labels: Record<string, string>): string {
  if (!Array.isArray(ids)) return "";
  return ids.map((id) => labels[String(id)] ?? String(id).replaceAll("_", " ")).join("|");
}

function labelAppsForExport(
  apps: unknown,
  clarifiers: unknown,
  labels: Record<string, string>,
): string {
  if (!Array.isArray(apps)) return "";
  const other =
    clarifiers &&
    typeof clarifiers === "object" &&
    typeof (clarifiers as { other_app?: unknown }).other_app === "string"
      ? String((clarifiers as { other_app: string }).other_app).trim()
      : "";
  return apps
    .map((id) => {
      const key = String(id);
      if (key === "other") return other || labels.other || "Other";
      return labels[key] ?? key.replaceAll("_", " ");
    })
    .join("|");
}

function labelWhenBucket(v: unknown): string {
  const id = String(v ?? "");
  const map: Record<string, string> = {
    now: "Happening now",
    recent: "Just ended",
    earlier: "Earlier today",
  };
  return map[id] ?? id.replaceAll("_", " ");
}

function labelDevice(v: unknown): string {
  const id = String(v ?? "");
  const map: Record<string, string> = {
    iphone: "iPhone",
    ipad: "iPad",
    android: "Android phone",
    windows: "Windows laptop",
    mac: "Mac",
    linux: "Linux laptop",
    unknown: "Not sure",
    mobile: "Phone",
    desktop: "Laptop / desktop",
    chrome: "Chrome",
    safari: "Safari",
    firefox: "Firefox",
    edge: "Edge",
    opera: "Opera",
    samsung: "Samsung Internet",
  };
  return map[id] ?? (id ? id.replaceAll("_", " ") : "");
}

function labelBrowser(v: unknown): string {
  const id = String(v ?? "");
  if (!id || id === "unknown" || !isBrowserId(id)) return "";
  return labelDevice(id);
}

function labelDeviceType(v: unknown): string {
  const id = String(v ?? "");
  if (!id || isBrowserId(id)) return "";
  return labelDevice(id);
}

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

function requireStaff(user: OpsUser) {
  if (user.role === "viewer") throw new HttpError(403, "forbidden");
}

function requireSuperAdmin(user: OpsUser) {
  if (user.role !== "super_admin") throw new HttpError(403, "forbidden");
}

function publicUser(user: OpsUser) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    company: user.company,
  };
}

const COMPANIES = ["norrsken", "zuba", "dct"] as const;

async function incidentThread(
  db: Pool,
  incidentId: string,
): Promise<{ places: string; channel: string | null; threadTs: string | null }> {
  const { rows } = await db.query<{
    zones: string[];
    alert_channel: string | null;
    alert_ts: string | null;
  }>(
    `
    select i.zones, r.alert_channel, r.alert_ts
    from incident i
    left join lateral (
      select alert_channel, alert_ts
      from report
      where incident_id = i.id and alert_ts is not null
      order by created_at desc
      limit 1
    ) r on true
    where i.id = $1
    `,
    [incidentId],
  );
  const row = rows[0];
  if (!row) return { places: "the house", channel: null, threadTs: null };
  const labels = await db.query<{ label: string }>(
    `select label from zone where id = any($1::text[]) order by sort, label`,
    [row.zones],
  );
  const places = labels.rows.map((z) => z.label).filter(Boolean).join(", ") || "the house";
  return { places, channel: row.alert_channel, threadTs: row.alert_ts };
}

async function notifyIncident(
  db: Pool,
  env: Env,
  incidentId: string,
  text: string,
): Promise<boolean> {
  const thread = await incidentThread(db, incidentId);
  return postAlertsThread(env, {
    text: `Incident (${thread.places}): ${text}`,
    channel: thread.channel,
    threadTs: thread.threadTs,
  });
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
  role: z.enum(["super_admin", "admin", "viewer"]).default("viewer"),
  company: z.enum(COMPANIES).default("norrsken"),
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
    return { user: publicUser(user) };
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
      return { user: publicUser(user) };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  const selfAccountSchema = z.object({
    current_password: z.string().min(1).max(128),
    username: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9._-]+$/i, "username: letters, numbers, . _ -")
      .optional(),
    password: z.string().min(12).max(128).optional(),
  });

  app.patch("/api/ops/me", async (req, reply) => {
    try {
      const me = await requireOps(req, reply, db);
      const parsed = selfAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues.map((i) => i.message).join("; ") || "invalid_body",
        });
      }
      const { rows } = await db.query<{ password_hash: string }>(
        `select password_hash from ops_user where id = $1 and active = true`,
        [me.id],
      );
      const hash = rows[0]?.password_hash;
      if (!hash || !verifyPassword(parsed.data.current_password, hash)) {
        return reply.code(401).send({ error: "wrong_password" });
      }

      const nextUsername = parsed.data.username?.toLowerCase();
      const usernameChanged = Boolean(nextUsername && nextUsername !== me.username);
      if (!usernameChanged && !parsed.data.password) {
        return reply.code(400).send({ error: "no_change" });
      }

      let user = me;
      if (usernameChanged && nextUsername) {
        const updated = await setOpsUserUsername(db, me.id, nextUsername);
        if (!updated) return reply.code(404).send({ error: "not_found" });
        user = updated;
      }
      if (parsed.data.password) {
        await setOpsUserPassword(db, me.id, parsed.data.password);
      }
      return { user: publicUser(user) };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
        return reply.code(409).send({ error: "username_taken" });
      }
      throw err;
    }
  });

  app.get("/api/ops/users", async (req, reply) => {
    try {
      const me = await requireOps(req, reply, db);
      requireStaff(me);
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
      requireStaff(me);
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues.map((i) => i.message).join("; "),
        });
      }
      if (parsed.data.role !== "viewer") requireSuperAdmin(me);
      const user = await createOpsUser(db, {
        username: parsed.data.username,
        display_name: parsed.data.display_name,
        password: parsed.data.password,
        role: parsed.data.role,
        company: parsed.data.company,
        created_by: me.id,
      });
      return reply.code(201).send({ user: publicUser(user) });
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
      requireStaff(me);
      const { id } = req.params as { id: string };
      const body = z
        .object({
          active: z.boolean().optional(),
          password: z.string().min(12).max(128).optional(),
          username: z
            .string()
            .trim()
            .min(1)
            .max(64)
            .regex(/^[a-z0-9._-]+$/i, "username: letters, numbers, . _ -")
            .optional(),
        })
        .safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_body" });

      if (body.data.active === false && id === me.id) {
        return reply.code(400).send({ error: "cannot_deactivate_self" });
      }
      const target = await getOpsUserById(db, id);
      if (!target) return reply.code(404).send({ error: "not_found" });
      if (target.role !== "viewer") requireSuperAdmin(me);

      let user = null;
      if (body.data.username) {
        user = await setOpsUserUsername(db, id, body.data.username);
        if (!user) return reply.code(404).send({ error: "not_found" });
      }
      if (typeof body.data.active === "boolean") {
        user = await setOpsUserActive(db, id, body.data.active);
      }
      if (body.data.password) {
        await setOpsUserPassword(db, id, body.data.password);
        user = user ?? (await listOpsUsers(db)).find((u) => u.id === id) ?? null;
      }
      if (!user) return reply.code(404).send({ error: "not_found" });
      return { user: publicUser(user) };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
        return reply.code(409).send({ error: "username_taken" });
      }
      throw err;
    }
  });

  app.get("/api/ops/dashboard", async (req, reply) => {
    try {
      const me = await requireOps(req, reply, db);

      const [kpi, zones, reports, incidents, assignees] = await Promise.all([
        db.query(`select * from v_kpi_daily`),
        db.query(`select * from v_zone_health`),
        db.query(`select * from v_reports_full order by created_at desc limit 50`),
        db.query(`
          select v.*, i.root_cause, i.assigned_to,
            u.display_name as assignee_name,
            u.company as assignee_company,
            (
              select max(r.created_at) from report r where r.incident_id = v.id
            ) as last_report_at
          from v_open_incidents v
          join incident i on i.id = v.id
          left join ops_user u on u.id = i.assigned_to
        `),
        db.query(`
          select id, display_name, company
          from ops_user
          where active = true and role in ('super_admin', 'admin')
          order by display_name
        `),
      ]);

      return {
        kpi: kpi.rows[0] ?? null,
        zones: zones.rows,
        reports: reports.rows,
        incidents: incidents.rows,
        assignees: me.role === "viewer" ? [] : assignees.rows,
      };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/api/ops/integrations", async (req, reply) => {
    try {
      await requireOps(req, reply, db);
      const live = slackLiveStatus();
      const { rows } = await db.query<{
        slack_24h: string;
        metoo_24h: string;
        qr_24h: string;
        slack_7d: string;
        last_slack_at: Date | null;
        last_qr_at: Date | null;
      }>(`
        select
          count(*) filter (where channel = 'slack' and created_at > now() - interval '24 hours')::text as slack_24h,
          count(*) filter (where channel = 'slack_metoo' and created_at > now() - interval '24 hours')::text as metoo_24h,
          count(*) filter (where channel = 'qr' and created_at > now() - interval '24 hours')::text as qr_24h,
          count(*) filter (where channel in ('slack','slack_metoo') and created_at > now() - interval '7 days')::text as slack_7d,
          max(created_at) filter (where channel in ('slack','slack_metoo')) as last_slack_at,
          max(created_at) filter (where channel = 'qr') as last_qr_at
        from report
      `);
      const counts = rows[0];
      const channel = env.SLACK_ALERTS_CHANNEL?.trim() || null;
      return {
        slack: {
          configured: Boolean(env.SLACK_BOT_TOKEN),
          mode: live.mode,
          connected: live.connected,
          error: live.error,
          connected_at: live.connectedAt,
          team_name: live.teamName,
          bot_name: live.botName,
          alerts_channel: channel,
          last_alert: live.lastAlert,
        },
        reports: {
          slack_24h: Number(counts?.slack_24h ?? 0),
          metoo_24h: Number(counts?.metoo_24h ?? 0),
          qr_24h: Number(counts?.qr_24h ?? 0),
          slack_7d: Number(counts?.slack_7d ?? 0),
          last_slack_at: counts?.last_slack_at ?? null,
          last_qr_at: counts?.last_qr_at ?? null,
        },
      };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  const incidentActionSchema = z.object({
    action: z.enum(["ack", "investigating", "resolved"]),
    post_to_slack: z.boolean().optional(),
  });

  app.post("/api/ops/incidents/:id", async (req, reply) => {
    try {
      const me = await requireOps(req, reply, db);
      requireStaff(me);
      const id = (req.params as { id: string }).id;
      const parsed = incidentActionSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "bad_action" });
      const action = parsed.data.action;
      const { rows } = await db.query(
        `
        update incident
        set
          acked_at = case
            when $2 in ('ack', 'investigating') then coalesce(acked_at, now())
            else acked_at
          end,
          status = case
            when $2 = 'investigating' then 'investigating'
            when $2 = 'resolved' then 'resolved'
            else status
          end,
          resolved_at = case
            when $2 = 'resolved' then coalesce(resolved_at, now())
            else resolved_at
          end
        where id = $1
          and status in ('open', 'investigating')
        returning id, status, acked_at, resolved_at
        `,
        [id, action],
      );
      const incident = rows[0];
      if (!incident) return reply.code(404).send({ error: "not_found" });
      let slack_posted = false;
      if (parsed.data.post_to_slack) {
        const line =
          action === "ack" ? "Acknowledged." : action === "investigating" ? "Marked investigating." : "Marked resolved.";
        slack_posted = await notifyIncident(db, env, id, line);
      }
      return { incident, slack_posted };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/api/ops/incidents/:id/comments", async (req, reply) => {
    try {
      await requireOps(req, reply, db);
      const id = (req.params as { id: string }).id;
      const { rows } = await db.query(
        `
        select c.id, c.body, c.created_at, c.posted_to_slack,
          u.display_name as author_name, u.company as author_company
        from incident_comment c
        left join ops_user u on u.id = c.author_id
        where c.incident_id = $1
        order by c.created_at
        `,
        [id],
      );
      return { comments: rows };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/api/ops/incidents/:id/comments", async (req, reply) => {
    try {
      const me = await requireOps(req, reply, db);
      requireStaff(me);
      const id = (req.params as { id: string }).id;
      const parsed = z
        .object({
          body: z.string().trim().min(1).max(2000),
          post_to_slack: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
      const exists = await db.query(`select 1 from incident where id = $1`, [id]);
      if (!exists.rows[0]) return reply.code(404).send({ error: "not_found" });
      let posted = false;
      if (parsed.data.post_to_slack) {
        posted = await notifyIncident(db, env, id, parsed.data.body);
      }
      const { rows } = await db.query(
        `
        insert into incident_comment (incident_id, author_id, body, posted_to_slack)
        values ($1, $2, $3, $4)
        returning id, body, created_at, posted_to_slack
        `,
        [id, me.id, parsed.data.body, posted],
      );
      return reply.code(201).send({
        comment: {
          ...rows[0],
          author_name: me.display_name,
          author_company: me.company,
        },
        slack_posted: posted,
      });
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.patch("/api/ops/incidents/:id", async (req, reply) => {
    try {
      const me = await requireOps(req, reply, db);
      requireStaff(me);
      const id = (req.params as { id: string }).id;
      const parsed = z
        .object({
          assigned_to: z.string().uuid().nullable(),
          post_to_slack: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
      let assignee: OpsUser | null = null;
      if (parsed.data.assigned_to) {
        assignee = await getOpsUserById(db, parsed.data.assigned_to);
        if (!assignee || !assignee.active || assignee.role === "viewer") {
          return reply.code(400).send({ error: "bad_assignee" });
        }
      }
      const { rows } = await db.query(
        `
        update incident
        set assigned_to = $2
        where id = $1
        returning id, assigned_to
        `,
        [id, parsed.data.assigned_to],
      );
      if (!rows[0]) return reply.code(404).send({ error: "not_found" });
      let slack_posted = false;
      if (parsed.data.post_to_slack) {
        const who = assignee
          ? `Assigned to ${assignee.display_name} (${assignee.company}).`
          : "Assignment cleared.";
        slack_posted = await notifyIncident(db, env, id, who);
      }
      return {
        incident: {
          id: rows[0].id,
          assigned_to: rows[0].assigned_to,
          assignee_name: assignee?.display_name ?? null,
          assignee_company: assignee?.company ?? null,
        },
        slack_posted,
      };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  const createZoneSchema = z.object({
    id: z
      .string()
      .min(2)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "id: lowercase letters, numbers, hyphens"),
    label: z.string().min(1).max(120),
    floor: z.string().max(32).nullable().optional(),
    kind: z.enum(ZONE_KINDS).default("area"),
    sort: z.number().int().optional(),
  });

  app.get("/api/ops/zones", async (req, reply) => {
    try {
      await requireOps(req, reply, db);
      const zones = await listAllZonesWithCounts(db);
      return { zones };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/api/ops/zones", async (req, reply) => {
    try {
      const me = await requireOps(req, reply, db);
      requireStaff(me);
      const parsed = createZoneSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues.map((i) => i.message).join("; "),
        });
      }
      if (parsed.data.id === UNIVERSAL_ZONE_ID) {
        return reply.code(409).send({ error: "zone_id_reserved" });
      }
      const zone = await createZone(db, {
        id: parsed.data.id,
        label: parsed.data.label,
        floor: parsed.data.floor ?? null,
        kind: parsed.data.kind,
        sort: parsed.data.sort,
      });
      return reply.code(201).send({ zone });
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
        return reply.code(409).send({ error: "zone_id_taken" });
      }
      throw err;
    }
  });

  app.patch("/api/ops/zones/:id", async (req, reply) => {
    try {
      const me = await requireOps(req, reply, db);
      requireStaff(me);
      const { id } = req.params as { id: string };
      const body = z
        .object({
          label: z.string().min(1).max(120).optional(),
          floor: z.string().max(32).nullable().optional(),
          kind: z.enum(ZONE_KINDS).optional(),
          active: z.boolean().optional(),
          sort: z.number().int().optional(),
        })
        .safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_body" });
      if (id === UNIVERSAL_ZONE_ID && body.data.active === false) {
        return reply.code(409).send({ error: "universal_zone" });
      }
      if (body.data.active === false) {
        const reportCount = await countReportsForZone(db, id);
        if (reportCount > 0) {
          return reply.code(409).send({
            error: "zone_has_reports",
            report_count: reportCount,
            hint: "Zones with reports cannot be disabled.",
          });
        }
      }
      const zone = await updateZone(db, id, body.data);
      if (!zone) return reply.code(404).send({ error: "not_found" });
      return { zone };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/api/ops/qr", async (req, reply) => {
    try {
      await requireOps(req, reply, db);
      const zone = await getZone(db, UNIVERSAL_ZONE_ID);
      if (!zone || !zone.active) {
        return reply.code(404).send({ error: "universal_zone_missing" });
      }
      try {
        const host = typeof req.headers.host === "string" ? req.headers.host : undefined;
        const qr = await buildZoneQr(env, zone.id, { host });
        return {
          zone: { id: zone.id, label: zone.label, floor: zone.floor, kind: zone.kind },
          ...qr,
        };
      } catch (e) {
        return reply.code(503).send({
          error: e instanceof Error ? e.message : "qr_unavailable",
        });
      }
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/api/ops/zones/:id/qr", async (req, reply) => {
    try {
      await requireOps(req, reply, db);
      const { id } = req.params as { id: string };
      const zone = await getZone(db, id);
      if (!zone) return reply.code(404).send({ error: "not_found" });
      if (!zone.active) return reply.code(400).send({ error: "zone_inactive" });

      try {
        const host = typeof req.headers.host === "string" ? req.headers.host : undefined;
        const qr = await buildZoneQr(env, zone.id, { host });
        return {
          zone: {
            id: zone.id,
            label: zone.label,
            floor: zone.floor,
            kind: zone.kind,
          },
          ...qr,
        };
      } catch (e) {
        return reply.code(503).send({
          error: e instanceof Error ? e.message : "qr_unavailable",
        });
      }
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/api/ops/zones/:id", async (req, reply) => {
    try {
      const me = await requireOps(req, reply, db);
      requireStaff(me);
      const { id } = req.params as { id: string };
      if (id === UNIVERSAL_ZONE_ID) {
        return reply.code(409).send({ error: "universal_zone" });
      }
      const zone = await getZone(db, id);
      if (!zone) return reply.code(404).send({ error: "not_found" });
      const reportCount = await countReportsForZone(db, id);
      if (reportCount > 0) {
        return reply.code(409).send({
          error: "zone_has_reports",
          report_count: reportCount,
          hint: "Zones with reports cannot be deleted or disabled.",
        });
      }
      await deleteZone(db, id);
      return { ok: true, deleted: id };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/api/ops/reports", async (req, reply) => {
    try {
      await requireOps(req, reply, db);
      const q = req.query as { page?: string; limit?: string };
      const page = Math.max(1, Number(q.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));
      const offset = (page - 1) * limit;

      const [countRes, rowsRes] = await Promise.all([
        db.query<{ n: string }>(`select count(*)::text as n from report`),
        db.query(
          `
          select * from v_reports_full
          order by created_at desc
          limit $1 offset $2
          `,
          [limit, offset],
        ),
      ]);
      const total = Number(countRes.rows[0]?.n ?? 0);
      return {
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
        reports: rowsRes.rows,
      };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/api/ops/reports/:id", async (req, reply) => {
    try {
      const me = await requireOps(req, reply, db);
      requireStaff(me);
      const { id } = req.params as { id: string };
      const deleted = await deleteReport(db, id);
      if (!deleted) return reply.code(404).send({ error: "not_found" });
      return { ok: true, deleted: id };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/api/ops/reports/export.csv", async (req, reply) => {
    try {
      await requireOps(req, reply, db);
      const { rows } = await db.query(`select * from v_reports_full order by created_at desc limit 5000`);
      // Raw guest report fields only. Ticket assignment and comments stay off this file.
      type CsvCol = { title: string; field: string; kind?: "device" | "browser" };
      const columns: CsvCol[] = [
        { title: "id", field: "id" },
        { title: "created_at", field: "created_at" },
        { title: "symptoms", field: "symptoms" },
        { title: "apps", field: "apps" },
        { title: "when_bucket", field: "when_bucket" },
        { title: "occurred_at", field: "occurred_at" },
        { title: "company", field: "company" },
        { title: "user_type", field: "user_type" },
        { title: "user_type_other", field: "user_type_other" },
        { title: "contact_ok", field: "contact_ok" },
        { title: "contact_name", field: "contact_name" },
        { title: "contact_phone", field: "contact_phone" },
        { title: "contact_email", field: "contact_email" },
        { title: "device", field: "device_class", kind: "device" },
        { title: "browser", field: "browser", kind: "browser" },
        { title: "clarifiers", field: "clarifiers" },
        { title: "fill_ms", field: "fill_ms" },
        { title: "incident_id", field: "incident_id" },
      ];
      const lines = [columns.map((c) => c.title).join(",")];
      for (const r of rows as Record<string, unknown>[]) {
        lines.push(
          columns
            .map((col) => {
              const v = r[col.field];
              let s = "";
              if (col.kind === "device") s = labelDeviceType(v);
              else if (col.kind === "browser") s = labelBrowser(v);
              else if (v == null) s = "";
              else if (col.field === "symptoms") s = labelList(v, SYMPTOM_LABELS as Record<string, string>);
              else if (col.field === "apps")
                s = labelAppsForExport(v, r.clarifiers, APP_LABELS as Record<string, string>);
              else if (col.field === "when_bucket") s = labelWhenBucket(v);
              else if (col.field === "clarifiers" && typeof v === "object")
                s = formatClarifiersDisplay(v as Record<string, unknown>);
              else if (Array.isArray(v)) s = v.join("|");
              else if (typeof v === "object") s = JSON.stringify(v);
              else s = String(v);
              return `"${s.replaceAll('"', '""')}"`;
            })
            .join(","),
        );
      }
      reply.header("content-type", "text/csv; charset=utf-8");
      reply.header("content-disposition", 'attachment; filename="norrsken-reports.csv"');
      return reply.send(lines.join("\n"));
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/api/ops/analytics", async (req, reply) => {
    try {
      await requireOps(req, reply, db);
      const q = req.query as { days?: string; channel?: string; zone_id?: string };
      const days = Math.min(90, Math.max(1, Number(q.days) || 30));
      const channel = q.channel === "qr" || q.channel === "slack" ? q.channel : null;
      const zoneId = q.zone_id && /^[a-z0-9-]+$/.test(q.zone_id) ? q.zone_id : null;

      const filters: string[] = [`r.created_at > now() - ($1 || ' days')::interval`];
      const params: unknown[] = [String(days)];
      if (channel) {
        params.push(channel);
        filters.push(`r.channel = $${params.length}`);
      }
      if (zoneId) {
        params.push(zoneId);
        filters.push(`r.zone_id = $${params.length}`);
      }
      const where = filters.join(" and ");

      const [perDay, apps, symptoms, wifi, zones, companies, userTypes, contact, kpi, zoneList, resolvedByCompany] = await Promise.all([
        db.query(
          `
          select d::date as day, coalesce(c.n, 0)::int as reports
          from generate_series(
            (current_date - ($1::int - 1)),
            current_date,
            '1 day'::interval
          ) as d
          left join (
            select date_trunc('day', r.created_at)::date as day, count(*)::int as n
            from report r
            where ${where}
            group by 1
          ) c on c.day = d::date
          order by 1
          `,
          params,
        ),
        db.query(
          `
          select a.app, count(*)::int as n
          from report r
          cross join lateral unnest(r.apps) as a(app)
          where ${where}
          group by a.app
          order by n desc
          limit 12
          `,
          params,
        ),
        db.query(
          `
          select s.symptom, count(*)::int as n
          from report r
          cross join lateral unnest(r.symptoms) as s(symptom)
          where ${where}
          group by s.symptom
          order by n desc
          limit 12
          `,
          params,
        ),
        db.query(
          `
          select r.wifi_context, count(*)::int as n
          from report r
          where ${where}
          group by r.wifi_context
          order by n desc
          `,
          params,
        ),
        db.query(
          `
          select z.id as zone_id, z.label, count(r.id)::int as report_count
          from zone z
          left join report r on r.zone_id = z.id and ${where}
          group by z.id, z.label
          having count(r.id) > 0
          order by report_count desc
          limit 12
          `,
          params,
        ),
        db.query(
          `
          select min(trim(r.company)) as company, count(*)::int as n
          from report r
          where ${where}
            and nullif(trim(r.company), '') is not null
          group by lower(trim(r.company))
          order by n desc
          limit 8
          `,
          params,
        ),
        db.query(
          `
          select r.user_type, count(*)::int as n
          from report r
          where ${where}
            and r.user_type is not null
          group by r.user_type
          order by n desc
          `,
          params,
        ),
        db.query(
          `
          select
            count(*) filter (where r.contact_ok)::int as with_contact,
            count(*)::int as total
          from report r
          where ${where}
          `,
          params,
        ),
        db.query(`select * from v_kpi_daily`),
        db.query(
          `select id, label from zone where active = true and id <> 'house' order by sort, label`,
        ),
        db.query(`
          select u.company,
            count(*)::int as n,
            round(avg(extract(epoch from (i.resolved_at - i.opened_at)) / 60))::int as mttr_minutes
          from incident i
          join ops_user u on u.id = i.assigned_to
          where i.status = 'resolved'
            and i.resolved_at > now() - interval '30 days'
          group by u.company
          order by n desc
        `),
      ]);
      return {
        filters: { days, channel: channel ?? "all", zone_id: zoneId },
        zones_options: zoneList.rows,
        kpi: kpi.rows[0] ?? null,
        reports_per_day: perDay.rows,
        apps: apps.rows,
        symptoms: symptoms.rows,
        wifi: wifi.rows,
        top_zones: zones.rows,
        companies: companies.rows,
        user_types: userTypes.rows,
        contact: contact.rows[0] ?? { with_contact: 0, total: 0 },
        resolved_by_company: resolvedByCompany.rows,
        note: "Charts respect the filters above.",
      };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/api/ops/analytics/export.csv", async (req, reply) => {
    try {
      await requireOps(req, reply, db);
      const q = req.query as {
        kind?: string;
        days?: string;
        channel?: string;
        zone_id?: string;
      };
      const kind = q.kind || "apps";
      const days = Math.min(90, Math.max(1, Number(q.days) || 30));
      const channel = q.channel === "qr" || q.channel === "slack" ? q.channel : null;
      const zoneId = q.zone_id && /^[a-z0-9-]+$/.test(q.zone_id) ? q.zone_id : null;

      const filters: string[] = [`r.created_at > now() - ($1 || ' days')::interval`];
      const params: unknown[] = [String(days)];
      if (channel) {
        params.push(channel);
        filters.push(`r.channel = $${params.length}`);
      }
      if (zoneId) {
        params.push(zoneId);
        filters.push(`r.zone_id = $${params.length}`);
      }
      const where = filters.join(" and ");

      let rows: Record<string, unknown>[] = [];
      let header: string[] = [];
      if (kind === "per_day") {
        const r = await db.query(
          `
          select date_trunc('day', r.created_at)::date as day, count(*)::int as reports
          from report r
          where ${where}
          group by 1
          order by 1
          `,
          params,
        );
        rows = r.rows;
        header = ["day", "reports"];
      } else if (kind === "symptoms") {
        const r = await db.query(
          `
          select s.symptom, count(*)::int as n
          from report r
          cross join lateral unnest(r.symptoms) as s(symptom)
          where ${where}
          group by s.symptom
          order by n desc
          `,
          params,
        );
        rows = r.rows;
        header = ["symptom", "n"];
      } else if (kind === "wifi") {
        const r = await db.query(
          `
          select r.wifi_context, count(*)::int as n
          from report r
          where ${where}
          group by r.wifi_context
          order by n desc
          `,
          params,
        );
        rows = r.rows;
        header = ["wifi_context", "n"];
      } else if (kind === "zones") {
        const r = await db.query(
          `
          select z.id as zone_id, z.label, count(r.id)::int as report_count
          from zone z
          left join report r on r.zone_id = z.id and ${where}
          group by z.id, z.label
          order by report_count desc
          `,
          params,
        );
        rows = r.rows;
        header = ["zone_id", "label", "report_count"];
      } else {
        const r = await db.query(
          `
          select a.app, count(*)::int as n
          from report r
          cross join lateral unnest(r.apps) as a(app)
          where ${where}
          group by a.app
          order by n desc
          `,
          params,
        );
        rows = r.rows;
        header = ["app", "n"];
      }
      const lines = [header.join(",")];
      for (const row of rows) {
        lines.push(header.map((h) => `"${String(row[h] ?? "").replaceAll('"', '""')}"`).join(","));
      }
      reply.header("content-type", "text/csv; charset=utf-8");
      reply.header("content-disposition", `attachment; filename="norrsken-${kind}.csv"`);
      return reply.send(lines.join("\n"));
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
