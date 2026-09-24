# Runbook

Stub — completed in M6.

## Local

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm --filter @norrsken/api dev
```

## Privacy checklist (M6)

- [ ] No raw Slack user IDs persisted
- [ ] No raw IPs persisted
- [ ] Access logs strip client IPs
- [ ] `daily_salt` deleted at UTC day rollover
- [ ] Session / rate tables TTL ≤ 24 h
