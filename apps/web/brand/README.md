# Brand assets

Drop partner and house logos here. Both the **ops dashboard** (`/ops/`) and the **QR report form** (`/qr/`) copy this folder into their builds automatically.

## Add Zuba Broadband logos

Place these two files in this directory:

| Filename | Use when |
|---|---|
| `zuba-logo-on-light.png` | Light backgrounds (print flyer, ops light theme, QR form) |
| `zuba-logo-on-dark.png` | Dark backgrounds (ops dark theme, dark UI chrome) |

PNG is fine (what Zuba ships). Keep transparent backgrounds if you can.

### Naming tip

- **on-light** = the logo version meant to sit on white / pale backgrounds (usually the full-colour or dark mark)
- **on-dark** = the logo version meant to sit on charcoal / black (usually white or light mark)

## Already here

| File | Role |
|---|---|
| `norrsken-logo-dark.svg` | Norrsken wordmark for light UI |
| `norrsken-logo-white.svg` | Norrsken wordmark for dark UI |

## After adding files

Rebuild so copies land in both apps:

```bash
pnpm --filter @norrsken/web build
```

Or on the VM: `docker compose up -d --build`.
