# Brand assets

Drop partner and house logos here. Both the **ops dashboard** (`/ops/`) and the **QR report form** (`/qr/`) copy this folder into their builds automatically.

## Add Zuba Broadband logos

Place these two **real PNG files** in this directory (not Finder aliases / shortcuts):

| Filename | Use when |
|---|---|
| `zuba-logo-on-light.png` | Light backgrounds (print flyer, ops light theme, QR form) — dark/coloured mark |
| `zuba-logo-on-dark.png` | Dark backgrounds (ops dark theme) — light/white mark |

**Important:** On macOS, dragging from Finder can create a tiny “alias” file that browsers can’t display. Copy with Terminal instead:

```bash
cp /path/to/real-logo.png apps/web/brand/zuba-logo-on-light.png
```

Confirm with `file apps/web/brand/zuba-*.png` — you should see `PNG image data`, not `MacOS Alias`.

## Already here

| File | Role |
|---|---|
| `norrsken-logo-dark.svg` | Norrsken wordmark for light UI |
| `norrsken-logo-white.svg` | Norrsken wordmark for dark UI |

## After adding files

```bash
pnpm --filter @norrsken/web build
```

Or on the VM: `docker compose up -d --build`.
