import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const keysDir = path.join(__dirname, "keys");
const configPath = path.join(root, "config", "qr-public-keys.json");

const kid = process.argv[2] || "k1";

fs.mkdirSync(keysDir, { recursive: true });

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pubDer = publicKey.export({ type: "spki", format: "der" }) as Buffer;
const privPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
const pubB64 = pubDer.toString("base64url");

const privPath = path.join(keysDir, `qr-ed25519-${kid}.pem`);
const defaultPriv = path.join(keysDir, "qr-ed25519.pem");
fs.writeFileSync(privPath, privPem);
fs.writeFileSync(defaultPriv, privPem);

let existing: { keys: { kid: string; alg: string; publicKeySpkiBase64url: string }[] } = {
  keys: [],
};
if (fs.existsSync(configPath)) {
  existing = JSON.parse(fs.readFileSync(configPath, "utf8"));
}
existing.keys = existing.keys.filter((k) => k.kid !== kid);
existing.keys.push({
  kid,
  alg: "Ed25519",
  publicKeySpkiBase64url: pubB64,
});
fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + "\n");

console.log(`Wrote private key → ${privPath}`);
console.log(`Updated public keys → ${configPath} (kid=${kid})`);
console.log("Keep private keys offline; never commit scripts/keys/");
