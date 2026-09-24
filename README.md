# Norrsken Network Feedback

QR + Slack anonymous network problem reports for Norrsken House Kigali.

## Quick start

```bash
cp .env.example .env
# set EDIT_TOKEN_SECRET, OPS_ADMIN_USERNAME, OPS_ADMIN_PASSWORD
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm --filter @norrsken/web build
pnpm --filter @norrsken/api dev
```

- Health: `GET http://localhost:3000/health`
- **Ops dashboard:** http://localhost:3000/ops/ → **Zones** tab → QR / link → Open report page
- **Member/guest report:** that same `/r/...` URL in any browser (no login). QR is optional.

Set `PUBLIC_BASE_URL` in `.env` to your VM address (e.g. `http://192.168.1.50:8080`) so generated links/QRs point at the right host.

## QR stickers / test links

From the ops UI (**Zones → QR / link → Print**), or CLI:

```bash
pnpm qr:keygen          # once — writes scripts/keys (gitignored) + config/qr-public-keys.json
pnpm --filter @norrsken/shared build
PUBLIC_BASE_URL=http://localhost:3000 pnpm qr:gen
```

## Ubuntu VM

Full steps: [docs/deploy-ubuntu.md](./docs/deploy-ubuntu.md)

After `docker compose up -d --build`:

| URL | Purpose |
|---|---|
| `http://<vm-ip>:8080/ops/` | Ops dashboard (per-user login) |
| `http://<vm-ip>:8080/health` | Health check |

Sign in as the bootstrap admin, then open **Users** to create accounts for each monitor.

## Workspace

| Path | Role |
|---|---|
| `apps/api` | Fastify + Slack Bolt, ingest, jobs, ops auth |
| `apps/web/ops` | Norrsken-branded ops dashboard |
| `packages/db` | Migrations, seed, queries |
| `packages/shared` | Enums, zod schemas, clarifiers |
| `config/` | SSIDs, engine thresholds |
| `scripts/` | keygen, qr-gen |
