import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { loadPrivateKey, signZoneToken } from "@norrsken/shared";
import { ZONES } from "@norrsken/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "scripts", "out");
const kid = process.env.QR_KID || "k1";
const baseUrl = (process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const privPath =
  process.env.QR_PRIVATE_KEY_PATH || path.join(__dirname, "keys", "qr-ed25519.pem");

if (!fs.existsSync(privPath)) {
  console.error(`Private key not found: ${privPath}`);
  console.error("Run: pnpm qr:keygen");
  process.exit(1);
}

const privateKey = loadPrivateKey(privPath);
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(outDir, "png"), { recursive: true });

type Row = { id: string; label: string; token: string; url: string };

const rows: Row[] = [];

for (const z of ZONES) {
  const token = signZoneToken(privateKey, z.id, kid);
  const url = `${baseUrl}/r/${token}`;
  rows.push({ id: z.id, label: z.label, token, url });
  const pngPath = path.join(outDir, "png", `${z.id}.png`);
  await QRCode.toFile(pngPath, url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });
}

const linksPath = path.join(outDir, "links.txt");
fs.writeFileSync(
  linksPath,
  rows.map((r) => `${r.id}\t${r.label}\t${r.url}`).join("\n") + "\n",
);

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Norrsken Wi‑Fi QR sheet</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #0a0a0a; }
    h1 { font-size: 1.25rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 24px; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 16px; text-align: center; break-inside: avoid; }
    .card img { width: 160px; height: 160px; }
    .label { font-weight: 700; margin: 8px 0 4px; }
    .hint { font-size: 12px; color: #666; }
    .url { font-size: 10px; word-break: break-all; color: #888; margin-top: 8px; }
    @media print { body { margin: 12px; } .card { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>Norrsken House · Wi‑Fi problem? Scan (under 10 seconds)</h1>
  <p class="hint">Print this sheet · cut and place at each zone · URL under each code is for trust</p>
  <div class="grid">
    ${rows
      .map(
        (r) => `
      <div class="card">
        <img src="png/${r.id}.png" alt="QR ${r.id}" />
        <div class="label">${escapeHtml(r.label)}</div>
        <div class="hint">Wi‑Fi problem? Scan</div>
        <div class="url">${escapeHtml(r.url)}</div>
      </div>`,
      )
      .join("")}
  </div>
</body>
</html>`;

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

const sheetPath = path.join(outDir, "qr-sheet.html");
fs.writeFileSync(sheetPath, html);

console.log(`Generated ${rows.length} QR codes`);
console.log(`Sheet: ${sheetPath}`);
console.log(`Links: ${linksPath}`);
console.log(`Open a link in the browser to test (no login).`);
console.log(`Example:\n  ${rows[0]?.url}`);
