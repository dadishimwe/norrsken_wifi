# Ubuntu VM deployment (local server)

This stack runs as Docker Compose on an Ubuntu VM: Postgres 16, the API, and Caddy as reverse proxy. The **ops dashboard** is served by the API at `/ops/`.

## Where to go

| URL | Purpose | Who |
|---|---|---|
| `http://<vm-ip>:8080/ops/` | **Ops dashboard** (login required) | Network monitors / admins |
| `http://<vm-ip>:8080/health` | Health check | Anyone |
| `http://<vm-ip>:8080/api/reports` | Report ingest (QR / Slack later) | Public report flow |

After first login as admin, open **Users** to create individual monitor accounts.

## 1. Prepare the VM

```bash
sudo apt update
sudo apt install -y git curl ca-certificates
# Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# log out and back in so docker works without sudo
```

Confirm:

```bash
docker --version
docker compose version
```

## 2. Clone and configure

```bash
sudo mkdir -p /opt/norrsken
sudo chown "$USER:$USER" /opt/norrsken
cd /opt/norrsken
git clone https://github.com/dadishimwe/norrsken_wifi.git .
cp .env.example .env
nano .env
```

Set at least:

```env
NODE_ENV=production
EDIT_TOKEN_SECRET=<random-32+-chars>
OPS_ADMIN_USERNAME=admin
OPS_ADMIN_PASSWORD=<strong-password-12+-chars>
OPS_ADMIN_DISPLAY_NAME=Network Admin
# DATABASE_URL is overridden inside Compose to use the postgres service
```

Generate a secret:

```bash
openssl rand -hex 24
```

## 3. Start the stack

```bash
cd /opt/norrsken
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

On first boot the API:

1. Runs migrations + zone seed  
2. Creates the **bootstrap admin** from `OPS_ADMIN_*` (only if no ops users exist yet)  
3. Serves the dashboard at `/ops/`

## 4. Open the dashboard

From a browser on the LAN:

1. Go to **`http://<vm-ip>:8080/ops/`**
2. Sign in with `OPS_ADMIN_USERNAME` / `OPS_ADMIN_PASSWORD`
3. Open the **Users** tab
4. Create a **viewer** (or admin) account for each person who will monitor
5. Share their username + temporary password; they sign in on their own

Port **8080** is Caddy (preferred). Port **3000** hits the API directly if you need it for debugging.

## 5. Survive reboots (Docker + Compose)

Containers are configured with `restart: unless-stopped`. Also enable Docker itself on boot:

```bash
sudo systemctl enable --now docker
cd /opt/norrsken
sudo docker compose up -d
```

After a host reboot, `postgres`, `api`, and `caddy` should come back automatically. Check with:

```bash
docker compose ps
```

## 6. Static IP on the Ubuntu VM (netplan)

Keep the address you already use (example: `192.168.1.13`) so QR links and ops bookmarks don’t break.

1. Find the interface name and current gateway/DNS:

```bash
ip -br a
ip route | grep default
resolvectl status | head -20
```

Typical interface names: `eth0`, `ens18` (Proxmox), `enp0s3`.

2. Edit netplan (file name may vary):

```bash
ls /etc/netplan/
sudo nano /etc/netplan/00-installer-config.yaml
# or: 50-cloud-init.yaml / 01-netcfg.yaml
```

Example (adjust interface, address, gateway, DNS to match your LAN):

```yaml
network:
  version: 2
  ethernets:
    ens18:
      dhcp4: false
      addresses:
        - 192.168.1.13/24
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses: [1.1.1.1, 8.8.8.8]
```

3. Apply:

```bash
sudo netplan try    # 120s rollback if you lose connectivity — safest
# or: sudo netplan apply
```

4. From Proxmox, also reserve `192.168.1.13` in your router DHCP (or set the VM NIC to that IP) so nothing else claims it.

5. Update `.env` `PUBLIC_BASE_URL` if needed:

```env
PUBLIC_BASE_URL=http://192.168.1.13:8080
```

Then recreate QR links from the Zones tab (old printed QRs still work if they already pointed at this IP).

**Proxmox tip:** you can set a static IP inside the guest (above) *or* via the Proxmox cloud-init / network config for the VM. Prefer one place so they don’t fight.

## 7. Firewall (optional)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 8080/tcp
sudo ufw enable
```

For HTTPS later, point a hostname at the VM and update `deploy/Caddyfile` for automatic TLS.

## 8. Day-2 operations

```bash
# Update
cd /opt/norrsken
git pull
docker compose up -d --build

# Logs (API + ops errors)
docker compose logs -f api

# Last 100 lines only
docker compose logs --tail=100 api

# Backup Postgres
docker compose exec -T postgres pg_dump -U norrsken norrsken > backup-$(date +%F).sql
```

## Accounts model

- **Reporter QR/Slack traffic stays anonymous** (hashed actor keys only).
- **Ops accounts are separate staff logins** stored in `ops_user`.
- Roles: `admin` (dashboard + user management), `viewer` (dashboard only).
- Sessions are HTTP-only cookies (~12 h). Admins can disable accounts and reset passwords from **Users**.

## Without Docker

If you prefer bare metal:

```bash
# Install Node 20+, pnpm, Postgres 16
curl -fsSL https://get.pnpm.io/install.sh | sh -
# create DB role/database, set DATABASE_URL in .env
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm --filter @norrsken/web build
pnpm --filter @norrsken/shared build
pnpm --filter @norrsken/db build
pnpm --filter @norrsken/api build
NODE_ENV=production pnpm --filter @norrsken/api start
```

Then browse `http://<vm-ip>:3000/ops/`.

## QR report page (members & guests)

No login. Generate signed test URLs:

```bash
pnpm qr:keygen   # if you don't have scripts/keys yet
PUBLIC_BASE_URL=http://YOUR_IP:8080 pnpm qr:gen
```

Open a line from `scripts/out/links.txt` on a phone, or print `scripts/out/qr-sheet.html`.

**Keys:** the private signing key lives in `scripts/keys/` (not in git). On the VM either:

1. Copy `scripts/keys/qr-ed25519.pem` from your laptop securely, **or**
2. Run `pnpm qr:keygen` once on the VM, commit/push the updated `config/qr-public-keys.json`, then `pnpm qr:gen`.

Dashboard for staff remains at `/ops/`.

## Smoke test after deploy

```bash
curl -s http://127.0.0.1:8080/health
# open http://<vm-ip>:8080/ops/ and sign in
# open a URL from scripts/out/links.txt (member/guest report — no login)
```
