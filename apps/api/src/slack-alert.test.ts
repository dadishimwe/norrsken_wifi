import { describe, expect, it } from "vitest";
import { reportAlertText } from "./slack-alert.js";

describe("reportAlertText", () => {
  it("names the person and company when both are given", () => {
    expect(
      reportAlertText({ company: "Acme", contactOk: true, contactName: "Ama Kane" }),
    ).toBe("Ama Kane from Acme just reported an issue.");
  });

  it("stays anonymous when they did not share a name", () => {
    expect(reportAlertText({ company: "C2", contactOk: true, contactName: "  " })).toBe(
      "Anonymous person from C2 just reported an issue.",
    );
    expect(reportAlertText({ company: "C2", contactOk: false, contactName: "Ama Kane" })).toBe(
      "Anonymous person from C2 just reported an issue.",
    );
  });

  it("omits the company when it was left blank", () => {
    expect(reportAlertText({ contactOk: true, contactName: "Ama Kane" })).toBe(
      "Ama Kane just reported an issue.",
    );
    expect(reportAlertText({})).toBe("Anonymous person just reported an issue.");
  });
});
