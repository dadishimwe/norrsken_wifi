import { createHmac, timingSafeEqual } from "node:crypto";

/** Slack rejects requests whose timestamp is more than 5 minutes off. */
export const SLACK_MAX_SKEW_SEC = 5 * 60;

export function verifySlackSignature(opts: {
  signingSecret: string;
  timestamp: string;
  rawBody: string;
  signature: string;
  nowSec?: number;
}): boolean {
  const ts = Number(opts.timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > SLACK_MAX_SKEW_SEC) return false;
  if (!opts.signature.startsWith("v0=")) return false;

  const base = `v0:${opts.timestamp}:${opts.rawBody}`;
  const digest = createHmac("sha256", opts.signingSecret).update(base).digest("hex");
  const expected = Buffer.from(`v0=${digest}`);
  const actual = Buffer.from(opts.signature);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
