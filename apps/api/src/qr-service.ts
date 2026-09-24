import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { KeyObject } from "node:crypto";
import QRCode from "qrcode";
import { loadPrivateKey, signZoneToken } from "@norrsken/shared";
import type { Env } from "./env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedKey: { path: string; key: KeyObject } | null = null;

function resolvePrivateKeyPath(env: Env): string | null {
  const candidates = [
    env.QR_PRIVATE_KEY_PATH,
    path.resolve(__dirname, "../../../scripts/keys/qr-ed25519.pem"),
    path.resolve(process.cwd(), "scripts/keys/qr-ed25519.pem"),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function getQrPrivateKey(env: Env): KeyObject {
  const p = resolvePrivateKeyPath(env);
  if (!p) {
    throw new Error(
      "QR private key not found. Set QR_PRIVATE_KEY_PATH or run pnpm qr:keygen",
    );
  }
  if (cachedKey?.path === p) return cachedKey.key;
  const key = loadPrivateKey(p);
  cachedKey = { path: p, key };
  return key;
}

export function publicBaseUrl(env: Env, reqHost?: string): string {
  if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL.replace(/\/$/, "");
  if (reqHost) {
    const proto = env.NODE_ENV === "production" ? "https" : "http";
    return `${proto}://${reqHost}`;
  }
  return `http://127.0.0.1:${env.PORT}`;
}

export async function buildZoneQr(
  env: Env,
  zoneId: string,
  opts?: { host?: string },
): Promise<{ token: string; url: string; png_data_url: string; kid: string }> {
  const kid = env.QR_KID || "k1";
  const key = getQrPrivateKey(env);
  const token = signZoneToken(key, zoneId, kid);
  const base = publicBaseUrl(env, opts?.host);
  const url = `${base}/r/${token}`;
  const png_data_url = await QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });
  return { token, url, png_data_url, kid };
}
