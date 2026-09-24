import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, type Db, createOpsUser, countOpsUsers } from "@norrsken/db";
import { randomBytes } from "node:crypto";
import { loadEnv } from "../src/env.js";
import Fastify from "fastify";
import { registerOpsRoutes } from "../src/ops-routes.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("ops auth (integration)", () => {
  let db: Db;
  let env: ReturnType<typeof loadEnv>;
  let app: ReturnType<typeof Fastify>;
  const username = `ops_${randomBytes(4).toString("hex")}`;

  beforeAll(async () => {
    process.env.EDIT_TOKEN_SECRET ??= "test-edit-token-secret-at-least-32-chars!!";
    process.env.NODE_ENV = "test";
    env = loadEnv();
    db = createPool(env.DATABASE_URL);
    app = Fastify();
    await registerOpsRoutes(app, db, env);
    await app.ready();

    await createOpsUser(db, {
      username,
      display_name: "Test Admin",
      password: "test-password-12",
      role: "admin",
    });
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  it("logs in and returns me", async () => {
    expect(await countOpsUsers(db)).toBeGreaterThan(0);

    const login = await app.inject({
      method: "POST",
      url: "/api/ops/login",
      payload: { username, password: "test-password-12" },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.headers["set-cookie"];
    expect(cookie).toBeTruthy();

    const me = await app.inject({
      method: "GET",
      url: "/api/ops/me",
      headers: { cookie: Array.isArray(cookie) ? cookie[0]! : String(cookie) },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.username).toBe(username);
  });

  it("rejects bad password", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/ops/login",
      payload: { username, password: "wrong-password-xx" },
    });
    expect(login.statusCode).toBe(401);
  });
});
