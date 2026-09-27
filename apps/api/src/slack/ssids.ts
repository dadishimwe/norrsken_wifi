import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadSsids(): { id: string; label: string }[] {
  const candidates = [
    path.resolve(__dirname, "../../../../config/ssids.json"),
    path.resolve(process.cwd(), "config/ssids.json"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as {
      ssids?: { id: string; label: string }[];
    };
    if (raw.ssids?.length) return raw.ssids;
  }
  return [
    { id: "member_wifi", label: "Member Wi-Fi" },
    { id: "guest_wifi", label: "Guest Wi-Fi" },
    { id: "wired", label: "Wired" },
    { id: "unknown", label: "Not sure" },
  ];
}
