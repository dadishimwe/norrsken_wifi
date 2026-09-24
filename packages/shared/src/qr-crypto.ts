import { createPublicKey, createPrivateKey, sign, verify, type KeyObject } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type QrPublicKey = {
  kid: string;
  alg: "Ed25519";
  publicKeySpkiBase64url: string;
};

export type QrPublicKeyConfig = {
  keys: QrPublicKey[];
};

export function loadPublicKeys(configPath: string): Map<string, KeyObject> {
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as QrPublicKeyConfig;
  const map = new Map<string, KeyObject>();
  for (const k of raw.keys) {
    const der = Buffer.from(k.publicKeySpkiBase64url, "base64url");
    map.set(k.kid, createPublicKey({ key: der, format: "der", type: "spki" }));
  }
  return map;
}

export function loadPrivateKey(pemPath: string): KeyObject {
  const pem = fs.readFileSync(pemPath, "utf8");
  return createPrivateKey(pem);
}

/** Canonical message: zoneId || kid (UTF-8). */
export function qrMessage(zoneId: string, kid: string): Buffer {
  return Buffer.from(`${zoneId}||${kid}`, "utf8");
}

export function signZoneToken(privateKey: KeyObject, zoneId: string, kid: string): string {
  const sig = sign(null, qrMessage(zoneId, kid), privateKey);
  return `${zoneId}.${kid}.${sig.toString("base64url")}`;
}

export type VerifiedZoneToken = {
  zoneId: string;
  kid: string;
};

export function parseZoneToken(token: string): { zoneId: string; kid: string; sig: string } | null {
  const parts = token.split(".");
  if (parts.length < 3) return null;
  const sig = parts.pop();
  const kid = parts.pop();
  const zoneId = parts.join(".");
  if (!sig || !kid || !zoneId) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(kid)) return null;
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(zoneId)) return null;
  return { zoneId, kid, sig };
}

export function verifyZoneToken(
  token: string,
  publicKeys: Map<string, KeyObject>,
): VerifiedZoneToken | null {
  const parsed = parseZoneToken(token);
  if (!parsed) return null;
  const key = publicKeys.get(parsed.kid);
  if (!key) return null;
  let sig: Buffer;
  try {
    sig = Buffer.from(parsed.sig, "base64url");
  } catch {
    return null;
  }
  const ok = verify(null, qrMessage(parsed.zoneId, parsed.kid), key, sig);
  if (!ok) return null;
  return { zoneId: parsed.zoneId, kid: parsed.kid };
}

export function defaultPublicKeysPath(fromDir: string): string {
  return path.resolve(fromDir, "../../../config/qr-public-keys.json");
}
