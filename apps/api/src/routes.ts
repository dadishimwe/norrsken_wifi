import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { listActiveZones } from "@norrsken/db";
import type { Env } from "./env.js";
import { createReport, HttpError, patchReport } from "./reports-service.js";

const BODY_LIMIT = 8 * 1024; // 8 KB

export async function registerRoutes(app: FastifyInstance, db: Pool, env: Env) {
  app.get("/health", async () => ({ ok: true }));

  app.get("/api/zones", async () => {
    const zones = await listActiveZones(db);
    return {
      zones: zones.map((z) => ({
        id: z.id,
        label: z.label,
        floor: z.floor,
        kind: z.kind,
      })),
    };
  });

  app.post(
    "/api/reports",
    {
      bodyLimit: BODY_LIMIT,
    },
    async (req, reply) => {
      try {
        // Prefer direct connection; do not trust X-Forwarded-For for identity.
        // Campus check uses socket address only when CAMPUS_IPS is set.
        const remoteIp = req.socket.remoteAddress;
        const result = await createReport(db, env, req.body, remoteIp);
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof HttpError) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        req.log.error({ err: err instanceof Error ? err.message : "error" }, "create_report_failed");
        return reply.code(500).send({ error: "internal" });
      }
    },
  );

  app.patch(
    "/api/reports/:id",
    {
      bodyLimit: BODY_LIMIT,
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const tokenHeader = req.headers["x-edit-token"];
      const token =
        typeof tokenHeader === "string"
          ? tokenHeader
          : typeof (req.body as { edit_token?: string })?.edit_token === "string"
            ? (req.body as { edit_token: string }).edit_token
            : null;

      if (!token) {
        return reply.code(401).send({ error: "missing_token" });
      }

      // Strip edit_token from body before validation if present
      const body =
        req.body && typeof req.body === "object"
          ? Object.fromEntries(
              Object.entries(req.body as Record<string, unknown>).filter(
                ([k]) => k !== "edit_token",
              ),
            )
          : req.body;

      try {
        const result = await patchReport(db, env, id, token, body);
        return reply.send(result);
      } catch (err) {
        if (err instanceof HttpError) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        req.log.error({ err: err instanceof Error ? err.message : "error" }, "patch_report_failed");
        return reply.code(500).send({ error: "internal" });
      }
    },
  );
}
