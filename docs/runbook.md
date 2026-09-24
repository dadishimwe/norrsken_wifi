# Runbook

## Local development

```bash
pnpm install
cp .env.example .env
# set EDIT_TOKEN_SECRET, OPS_ADMIN_USERNAME, OPS_ADMIN_PASSWORD
pnpm db:migrate && pnpm db:seed
pnpm --filter @norrsken/web build
pnpm --filter @norrsken/api dev
```

- Health: http://localhost:3000/health  
- Ops dashboard: http://localhost:3000/ops/  

## Ubuntu VM

See [deploy-ubuntu.md](./deploy-ubuntu.md).

## Privacy checklist (M6)

- [ ] No raw Slack user IDs persisted
- [ ] No raw IPs persisted
- [ ] Access logs strip client IPs
- [ ] `daily_salt` deleted at UTC day rollover
- [ ] Session / rate tables TTL ≤ 24 h
- [ ] Ops staff accounts are separate from anonymous reporters
