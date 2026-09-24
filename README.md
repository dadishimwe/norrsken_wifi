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
- **Ops dashboard:** http://localhost:3000/ops/

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
