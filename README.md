# Norrsken Network Feedback

QR + Slack anonymous network problem reports for Norrsken House Kigali.

## Quick start

```bash
cp .env.example .env
pnpm install
# Prefer Docker when available:
#   docker compose up -d postgres
# Or use a local Postgres 16 (15 works for M0–M1) and set DATABASE_URL
pnpm db:migrate && pnpm db:seed
pnpm --filter @norrsken/api dev
```

Health: `GET http://localhost:3000/health`

### Note on Docker

`docker-compose.yml` targets `postgres:16`. If Docker Desktop is not installed, point `DATABASE_URL` at any local Postgres and run migrate/seed as above.

## Workspace

| Path | Role |
|---|---|
| `apps/api` | Fastify + Slack Bolt, ingest, jobs |
| `apps/web` | QR page + ops dashboard (M2/M5) |
| `packages/db` | Migrations, seed, queries |
| `packages/shared` | Enums, zod schemas, clarifiers |
| `config/` | SSIDs, engine thresholds |
| `scripts/` | keygen, qr-gen |
