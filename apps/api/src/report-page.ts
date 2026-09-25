import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { getZone, listActiveZones } from "@norrsken/db";
import {
  APP_LABELS,
  APPS,
  DEVICE_LABELS,
  DEVICE_OPTIONS,
  SYMPTOM_LABELS,
  SYMPTOMS,
  WHEN_BUCKETS,
  WHEN_LABELS,
  loadPublicKeys,
  verifyZoneToken,
} from "@norrsken/shared";
import type { Env } from "./env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveConfig(...parts: string[]): string | null {
  const candidates = [
    path.resolve(__dirname, "../../../", ...parts),
    path.resolve(process.cwd(), ...parts),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function resolveQrDist(envDir?: string): string | null {
  const candidates = [
    envDir,
    path.resolve(__dirname, "../../../apps/web/qr-page/dist"),
    path.resolve(process.cwd(), "apps/web/qr-page/dist"),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  }
  return null;
}

function loadSsids(): { id: string; label: string }[] {
  const p = resolveConfig("config", "ssids.json");
  if (!p) return [];
  const raw = JSON.parse(fs.readFileSync(p, "utf8")) as {
    ssids: { id: string; label: string }[];
  };
  return raw.ssids ?? [];
}

export async function registerReportPageRoutes(
  app: FastifyInstance,
  db: Pool,
  env: Env,
) {
  const keysPath =
    env.QR_PUBLIC_KEYS_PATH || resolveConfig("config", "qr-public-keys.json");
  if (!keysPath) {
    app.log.warn("QR public keys not found — /r/:token disabled");
    return;
  }
  const publicKeys = loadPublicKeys(keysPath);
  const qrDist = resolveQrDist(env.QR_STATIC_DIR);
  if (!qrDist) {
    app.log.warn("QR page dist not found — build apps/web qr-page");
  }

  let template = "";
  if (qrDist) {
    template = fs.readFileSync(path.join(qrDist, "index.html"), "utf8");
  }

  // Static assets for the QR page (js/css + brand logos at dist root)
  if (qrDist) {
    const { default: fastifyStatic } = await import("@fastify/static");
    await app.register(fastifyStatic, {
      root: qrDist,
      prefix: "/qr/",
      decorateReply: false,
    });
  }

  app.get("/r/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const verified = verifyZoneToken(token, publicKeys);

    if (!verified) {
      return reply
        .type("text/html")
        .code(400)
        .send(renderHtml(template, { ok: false, error: "Invalid or forged QR link." }));
    }

    const zone = await getZone(db, verified.zoneId);
    if (!zone || !zone.active) {
      return reply
        .type("text/html")
        .code(404)
        .send(renderHtml(template, { ok: false, error: "Unknown zone for this QR." }));
    }

    const zones = await listActiveZones(db);
    const bootstrap = {
      ok: true as const,
      zone: { id: zone.id, label: zone.label, floor: zone.floor },
      zones: zones.map((z) => ({ id: z.id, label: z.label, floor: z.floor })),
      symptoms: SYMPTOMS.map((id) => ({ id, label: SYMPTOM_LABELS[id] })),
      apps: APPS.map((id) => ({ id, label: APP_LABELS[id] })),
      when: WHEN_BUCKETS.map((id) => ({ id, label: WHEN_LABELS[id] })),
      devices: DEVICE_OPTIONS.map((id) => ({ id, label: DEVICE_LABELS[id] })),
      ssids: loadSsids(),
      min_fill_ms: env.MIN_FILL_MS,
    };

    if (!template) {
      return reply.code(503).send({ error: "qr_page_not_built" });
    }

    return reply.type("text/html").send(renderHtml(template, bootstrap));
  });

  // Dev convenience: signed link list for testing without printing
  app.get("/api/qr/test-links", async (_req, reply) => {
    if (env.NODE_ENV === "production") {
      return reply.code(404).send({ error: "not_found" });
    }
    return reply.send({
      hint: "Run pnpm qr:gen to create signed URLs, or use scripts/qr-gen",
      example: "/r/{zoneId}.{kid}.{sig}",
    });
  });
}

function renderHtml(template: string, bootstrap: unknown): string {
  const json = JSON.stringify(bootstrap).replace(/</g, "\\u003c");
  if (!template) {
    return `<!doctype html><html><body><pre>${json}</pre></body></html>`;
  }
  // Vite build references /qr/assets/...
  return template
    .replace(
      /window\.__BOOTSTRAP__\s*=\s*null;\s*\/\*__BOOTSTRAP__\*\//,
      `window.__BOOTSTRAP__ = ${json};`,
    )
    .replace(
      /window\.__BOOTSTRAP__\s*=\s*null;/,
      `window.__BOOTSTRAP__ = ${json};`,
    );
}
