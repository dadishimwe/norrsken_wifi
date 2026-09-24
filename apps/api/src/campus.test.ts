import { describe, expect, it } from "vitest";
import { campusWeight, parseCampusIps } from "../src/campus.js";
import { mintEditToken, verifyEditToken } from "../src/edit-token.js";

describe("campusWeight", () => {
  it("returns 1 when no CIDR list", () => {
    expect(campusWeight("203.0.113.5", [])).toBe(1);
  });

  it("down-weights off-campus", () => {
    const cidrs = parseCampusIps("203.0.113.0/24");
    expect(campusWeight("203.0.113.10", cidrs)).toBe(1);
    expect(campusWeight("198.51.100.1", cidrs)).toBe(0.3);
  });
});

describe("edit token", () => {
  const secret = "test-edit-token-secret-at-least-32-chars!!";

  it("round-trips", () => {
    const actor = Buffer.from("deadbeef", "hex");
    const token = mintEditToken(secret, "rid-1", actor);
    const v = verifyEditToken(secret, token);
    expect(v?.reportId).toBe("rid-1");
    expect(v?.actorHash.equals(actor)).toBe(true);
  });

  it("rejects tampering", () => {
    const token = mintEditToken(secret, "rid-1", Buffer.from("aa", "hex"));
    expect(verifyEditToken(secret, token + "x")).toBeNull();
  });
});
