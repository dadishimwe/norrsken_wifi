import { describe, expect, it } from "vitest";
import { browserFromUserAgent } from "./browser.js";

describe("browserFromUserAgent", () => {
  it("names the common browsers", () => {
    expect(
      browserFromUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      ),
    ).toBe("chrome");
    expect(
      browserFromUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
      ),
    ).toBe("edge");
    expect(
      browserFromUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0",
      ),
    ).toBe("firefox");
    expect(
      browserFromUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
      ),
    ).toBe("safari");
    expect(
      browserFromUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.92 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("chrome");
    expect(
      browserFromUserAgent(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe("samsung");
  });

  it("returns unknown when the header is missing", () => {
    expect(browserFromUserAgent(undefined)).toBe("unknown");
    expect(browserFromUserAgent("")).toBe("unknown");
  });
});
