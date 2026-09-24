import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, type Db } from "@norrsken/db";
import { randomBytes } from "node:crypto";
import { loadEnv } from "../src/env.js";
import { createReport, patchReport, HttpError } from "../src/reports-service.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("reports ingest (integration)", () => {
  let db: Db;
  let env: ReturnType<typeof loadEnv>;

  beforeAll(async () => {
    process.env.EDIT_TOKEN_SECRET ??= "test-edit-token-secret-at-least-32-chars!!";
    process.env.NODE_ENV = "test";
    env = loadEnv();
    db = createPool(env.DATABASE_URL);
  });

  afterAll(async () => {
    await db.end();
  });

  it("creates and patches a report with hash chain", async () => {
    const session = randomBytes(24).toString("hex");
    const created = await createReport(
      db,
      env,
      {
        zone_id: "l2-west-desks",
        zone_source: "qr",
        channel: "qr",
        symptoms: ["slow"],
        apps: [],
        when_bucket: "now",
        wifi_context: "unknown",
        clarifiers: {},
        device_class: "mobile",
        fill_ms: 2000,
        session_token: session,
      },
      undefined,
    );

    expect(created.report_id).toBeTruthy();
    expect(created.edit_token).toBeTruthy();

    const { rows } = await db.query<{ row_hash: Buffer; prev_hash: Buffer | null }>(
      "select row_hash, prev_hash from report where id = $1",
      [created.report_id],
    );
    expect(rows[0]?.row_hash).toBeTruthy();

    const patched = await patchReport(db, env, created.report_id, created.edit_token, {
      apps: ["zoom"],
      when_bucket: "recent",
      wifi_context: "member_wifi",
      clarifiers: { slow_scope: "one_app" },
    });
    expect(patched.ok).toBe(true);

    const after = await db.query<{ apps: string[]; wifi_context: string }>(
      "select apps, wifi_context from report where id = $1",
      [created.report_id],
    );
    expect(after.rows[0]?.apps).toContain("zoom");
    expect(after.rows[0]?.wifi_context).toBe("member_wifi");
  });

  it("rejects too-fast fills", async () => {
    await expect(
      createReport(
        db,
        env,
        {
          zone_id: "l2-west-desks",
          zone_source: "qr",
          symptoms: ["wifi_drops"],
          fill_ms: 100,
          session_token: randomBytes(24).toString("hex"),
        },
        undefined,
      ),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("rate-limits per zone per actor", async () => {
    const session = randomBytes(24).toString("hex");
    const body = {
      zone_id: "l2-booth-01",
      zone_source: "qr" as const,
      symptoms: ["cant_connect" as const],
      fill_ms: 2000,
      session_token: session,
    };
    await createReport(db, env, body, undefined);
    await expect(createReport(db, env, body, undefined)).rejects.toMatchObject({
      statusCode: 429,
    });
  });
});
