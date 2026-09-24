import { describe, expect, it } from "vitest";
import { pickClarifiers } from "./clarifiers.js";

describe("pickClarifiers", () => {
  it("picks symptom clarifier", () => {
    const picked = pickClarifiers({
      symptoms: ["call_choppy"],
      clarifiers: {},
      hasActiveIncident: false,
      isFirstWifiThisSession: false,
      maxClarifiers: 1,
    });
    expect(picked).toHaveLength(1);
    expect(picked[0]?.id).toBe("choppy_type");
  });

  it("prioritizes active incident", () => {
    const picked = pickClarifiers({
      symptoms: ["call_choppy"],
      clarifiers: {},
      hasActiveIncident: true,
      isFirstWifiThisSession: true,
      maxClarifiers: 2,
    });
    expect(picked[0]?.id).toBe("same_as_incident");
    expect(picked).toHaveLength(2);
  });

  it("skips known clarifiers", () => {
    const picked = pickClarifiers({
      symptoms: ["slow"],
      clarifiers: { slow_scope: "everything" },
      hasActiveIncident: false,
      isFirstWifiThisSession: false,
      maxClarifiers: 1,
    });
    expect(picked).toHaveLength(0);
  });
});
