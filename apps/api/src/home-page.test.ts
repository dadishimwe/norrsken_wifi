import { describe, expect, it } from "vitest";
import { renderHomePage } from "./home-page.js";

describe("renderHomePage", () => {
  it("links to the house report when a URL is available", () => {
    const html = renderHomePage({
      reportUrl: "https://norrskenkgl.duckdns.org/r/house.k1.sig",
    });
    expect(html).toContain("Report an issue");
    expect(html).toContain("https://norrskenkgl.duckdns.org/r/house.k1.sig");
    expect(html).toContain('href="/ops/"');
  });

  it("still explains the site when the report link cannot be built", () => {
    const html = renderHomePage({ reportUrl: null });
    expect(html).toContain("Scan the poster in the house");
    expect(html).not.toContain("Report an issue");
  });
});
