import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, type Db } from "@norrsken/db";
import { loadPrivateKey, signZoneToken, loadPublicKeys, verifyZoneToken } from "@norrsken/shared";
import { buildApp } from "../src/index.js";

const hasDb = Boolean(process.env.DATABASE_URL);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const privPath = path.join(root, "scripts/keys/qr-ed25519.pem");
const pubPath = path.join(root, "config/qr-public-keys.json");
const qrDist = path.join(root, "apps/web/qr-page/dist/index.html");

describe.skipIf(!hasDb || !fs.existsSync(privPath) || !fs.existsSync(qrDist))(
  "QR report page",
  () => {
    let db: Db;
    let app: Awaited<ReturnType<typeof buildApp>>["app"];
    let shutdown: Awaited<ReturnType<typeof buildApp>>["shutdown"];

    beforeAll(async () => {
      process.env.EDIT_TOKEN_SECRET ??= "test-edit-token-secret-at-least-32-chars!!";
      process.env.NODE_ENV = "test";
      const built = await buildApp();
      app = built.app;
      db = built.db;
      shutdown = built.shutdown;
      await app.ready();
    });

    afterAll(async () => {
      await shutdown();
    });

    it("serves a signed zone page", async () => {
      const key = loadPrivateKey(privPath);
      const token = signZoneToken(key, "l2-west-desks", "k1");
      const res = await app.inject({ method: "GET", url: `/r/${token}` });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("l2-west-desks");
      expect(res.body).toContain("__BOOTSTRAP__");
      expect(res.body).toContain("West desks");
    });

    it("rejects forged tokens", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/r/l2-west-desks.k1.notARealSignatureValueHereAAAA",
      });
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain("Invalid");
    });

    it("public keys verify generator output", () => {
      const key = loadPrivateKey(privPath);
      const keys = loadPublicKeys(pubPath);
      const token = signZoneToken(key, "l2-booth-03", "k1");
      expect(verifyZoneToken(token, keys)?.zoneId).toBe("l2-booth-03");
    });
  },
);
