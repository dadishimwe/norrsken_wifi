import { createHmac, timingSafeEqual } from "node:crypto";

export function mintEditToken(
  secret: string,
  reportId: string,
  actorHash: Buffer,
  ttlMs = 15 * 60 * 1000,
): string {
  const exp = Date.now() + ttlMs;
  const payload = `${reportId}.${exp}.${actorHash.toString("hex")}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyEditToken(
  secret: string,
  token: string,
): { reportId: string; actorHash: Buffer } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [reportId, expStr, actorHex, sig] = parts;
  if (!reportId || !expStr || !actorHex || !sig) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;

  const payload = `${reportId}.${expStr}.${actorHex}`;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return { reportId, actorHash: Buffer.from(actorHex, "hex") };
}
