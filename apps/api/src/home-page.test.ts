import { describe, expect, it } from "vitest";
import { renderHomePage } from "./home-page.js";

describe("renderHomePage", () => {
  it("explains the poster and does not publish the report link", () => {
    const html = renderHomePage();
    expect(html).toContain("Scan the poster in the house");
    expect(html).toContain('href="https://www.norrsken.org/"');
    expect(html).not.toContain("/ops/");
    expect(html).not.toContain("/r/");
    expect(html).not.toContain("Report an issue");
  });
});
