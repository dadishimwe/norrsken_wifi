import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { signZoneToken, verifyZoneToken, parseZoneToken } from "./qr-crypto.js";

describe("qr-crypto", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const kid = "test1";
  const keys = new Map([[kid, publicKey]]);

  it("round-trips a signed zone token", () => {
    const token = signZoneToken(privateKey, "l2-west-desks", kid);
    const verified = verifyZoneToken(token, keys);
    expect(verified).toEqual({ zoneId: "l2-west-desks", kid });
  });

  it("rejects forged signatures", () => {
    const token = signZoneToken(privateKey, "l2-west-desks", kid);
    const forged = token.replace(/\.[^.]+$/, ".AAAA");
    expect(verifyZoneToken(forged, keys)).toBeNull();
  });

  it("rejects zone swap with same signature", () => {
    const token = signZoneToken(privateKey, "l2-west-desks", kid);
    const parsed = parseZoneToken(token);
    expect(parsed).toBeTruthy();
    const swapped = `l2-east-desks.${parsed!.kid}.${parsed!.sig}`;
    expect(verifyZoneToken(swapped, keys)).toBeNull();
  });

  it("parses zone ids that contain dots? no — hyphens only", () => {
    const token = signZoneToken(privateKey, "booth-03", kid);
    expect(parseZoneToken(token)?.zoneId).toBe("booth-03");
  });
});
