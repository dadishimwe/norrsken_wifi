# Brand assets

The ops dashboard (`/ops/`) and the QR report form (`/qr/`) copy this folder into their builds.

| File | Role |
|---|---|
| `norrsken-logo-dark.svg` | Norrsken wordmark for light UI |
| `norrsken-logo-white.svg` | Norrsken wordmark for dark UI |

After replacing a logo:

```bash
pnpm --filter @norrsken/web build
```
