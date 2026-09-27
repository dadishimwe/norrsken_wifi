import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SLACK_MAX_SKEW_SEC, verifySlackSignature } from "./signature.js";
import { nextClarifier, parseDraft, slackActorToken, symptomError } from "./flow.js";

describe("verifySlackSignature", () => {
  const secret = "test-signing-secret";
  const now = 1_700_000_000;

  function sign(timestamp: string, body: string) {
    const digest = createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex");
    return `v0=${digest}`;
  }

  it("accepts a fresh matching signature", () => {
    const body = "payload=%7B%7D";
    const ts = String(now);
    expect(
      verifySlackSignature({
        signingSecret: secret,
        timestamp: ts,
        rawBody: body,
        signature: sign(ts, body),
        nowSec: now,
      }),
    ).toBe(true);
  });

  it("rejects a timestamp older than 5 minutes", () => {
    const body = "{}";
    const ts = String(now - SLACK_MAX_SKEW_SEC - 5);
    expect(
      verifySlackSignature({
        signingSecret: secret,
        timestamp: ts,
        rawBody: body,
        signature: sign(ts, body),
        nowSec: now,
      }),
    ).toBe(false);
  });

  it("rejects a bad signature", () => {
    expect(
      verifySlackSignature({
        signingSecret: secret,
        timestamp: String(now),
        rawBody: "{}",
        signature: "v0=deadbeef",
        nowSec: now,
      }),
    ).toBe(false);
  });
});

describe("slack report flow", () => {
  it("builds an actor token long enough to hash and never equal to the raw id", () => {
    const token = slackActorToken("U0123");
    expect(token.length).toBeGreaterThanOrEqual(16);
    expect(token.includes("U0123")).toBe(true);
    expect(token.startsWith("norrsken-slack:")).toBe(true);
  });

  it("requires 1 to 3 symptoms", () => {
    expect(symptomError([])).toBeTruthy();
    expect(symptomError(["slow"])).toBeNull();
    expect(symptomError(["slow", "wifi_drops", "cant_connect", "no_internet"])).toBeTruthy();
  });

  it("asks the choppy clarifier and does not re-ask once answered", () => {
    const draft = parseDraft(
      JSON.stringify({
        zone_id: "cafe",
        symptoms: ["call_choppy"],
        clarifiers: {},
      }),
    );
    const first = nextClarifier(draft, false, []);
    expect(first?.id).toBe("choppy_type");

    draft.clarifiers = { choppy_type: "audio" };
    expect(nextClarifier(draft, false, [])).toBeNull();
  });

  it("asks same-as-incident only while an incident is open", () => {
    const draft = parseDraft(JSON.stringify({ zone_id: "cafe", symptoms: ["slow"], clarifiers: {} }));
    expect(nextClarifier(draft, false, [])?.id).toBe("slow_scope");
    expect(nextClarifier(draft, true, [])?.id).toBe("same_as_incident");
  });
});
