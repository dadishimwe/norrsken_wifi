import { BROWSER_IDS, type BrowserId, type DeviceClass } from "./enums.js";

/**
 * Best-effort browser name from a User-Agent.
 * Order matters: Edge, Opera, Samsung, and Firefox tokens also contain Chrome or Safari.
 */
export function browserFromUserAgent(userAgent: string | undefined): BrowserId | "unknown" {
  const ua = userAgent ?? "";
  if (!ua) return "unknown";
  if (/Edg\/|EdgiOS\//.test(ua)) return "edge";
  if (/OPR\/|OPT\/|Opera/.test(ua)) return "opera";
  if (/SamsungBrowser\//.test(ua)) return "samsung";
  if (/FxiOS\/|Firefox\//.test(ua)) return "firefox";
  if (/CriOS\/|Chrome\//.test(ua)) return "chrome";
  if (/Version\/.+Safari\//.test(ua)) return "safari";
  return "unknown";
}

export function isBrowserId(id: string): id is BrowserId {
  return (BROWSER_IDS as readonly string[]).includes(id);
}

/** Phone, tablet, or computer from the same User-Agent. iPhone is checked before Mac. */
export function deviceFromUserAgent(userAgent: string | undefined): DeviceClass {
  const ua = userAgent ?? "";
  if (!ua) return "unknown";
  if (/iPhone|iPod/.test(ua)) return "iphone";
  if (/iPad/.test(ua)) return "ipad";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  if (/CrOS/.test(ua)) return "desktop";
  if (/Linux/.test(ua)) return "linux";
  if (/Mobile/.test(ua)) return "mobile";
  return "unknown";
}
