# Agent Hub: Host Guide

This guide is for the person hosting the Agent Hub server for your team.

---

## 1. Running the Hub

The Agent Hub server is a Fastify + SQLite application that serves the REST API and the React web dashboard simultaneously.

### Running in Development
```bash
pnpm --filter @agent-hub/hub dev
```

### Running in Production with PM2 (Recommended)
To keep the server running continuously in the background across shell exits:
```bash
# Install pm2 if not already installed
npm install -g pm2

# Build the latest assets
pnpm build

# Start the hub process
pm2 start "node apps/hub/dist/server.js" --name "agent-hub"

# Save process list for system reboot
pm2 save
pm2 startup
```

### Running with systemd (Linux)
Create `/etc/systemd/system/agent-hub.service`:
```ini
[Unit]
Description=Agent Hub Coordination Server
After=network.target

[Service]
Type=simple
User=mayank-sharma
WorkingDirectory=/home/mayank-sharma/Projects/smt
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=127.0.0.1
Environment=DATABASE_PATH=/home/mayank-sharma/Projects/smt/apps/hub/agent-hub.db
ExecStart=/usr/bin/node /home/mayank-sharma/Projects/smt/apps/hub/dist/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now agent-hub
sudo systemctl status agent-hub
```

---

## 2. Exposing the Hub with Cloudflare Tunnel (Free)

Cloudflare Tunnel creates an encrypted, zero-trust outbound connection from your host to Cloudflare's edge without opening firewall ports or acquiring a static public IP.

### Step 1: Install `cloudflared`
- **Linux (Debian/Ubuntu):**
  ```bash
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bullseye main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
  sudo apt-get update && sudo apt-get install -y cloudflared
  ```
- **macOS:**
  ```bash
  brew install cloudflared
  ```
- **Windows:**
  ```powershell
  winget install Cloudflare.cloudflared
  ```

### Step 2: Quick Ephemeral Tunnel (Zero Configuration)
For quick team sharing without configuring a custom domain:
```bash
cloudflared tunnel --url http://localhost:3000
```
*Output will display a public URL:*
```text
https://random-words-1234.trycloudflare.com
```
Share this URL as `HUB_URL` with your teammates.

### Step 3: Named Persistent Tunnel (Custom Domain)
1. Authenticate with your Cloudflare account:
   ```bash
   cloudflared tunnel login
   ```
2. Create a tunnel:
   ```bash
   cloudflared tunnel create agent-hub-tunnel
   ```
3. Route DNS traffic to the tunnel:
   ```bash
   cloudflared tunnel route dns agent-hub-tunnel hub.yourteamdomain.com
   ```
4. Create configuration file at `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: agent-hub-tunnel
   credentials-file: /home/mayank-sharma/.cloudflared/<TUNNEL_ID>.json

   ingress:
     - hostname: hub.yourteamdomain.com
       service: http://localhost:3000
     - service: http_status:404
   ```
5. Run tunnel as a service:
   ```bash
   sudo cloudflared service install
   sudo systemctl start cloudflared
   ```

---

## 3. Backups and Disaster Recovery

Agent Hub persists data in SQLite using Write-Ahead Logging (WAL) mode. Safe online backups are taken using SQLite's native `.backup` API, ensuring consistent point-in-time snapshots without stopping the server.

### Creating an Automated Backup
Run the backup script:
```bash
./scripts/backup.sh apps/hub/agent-hub.db ./backups
```
*Expected Output:*
```text
Backing up apps/hub/agent-hub.db to ./backups/agent-hub-backup-20261102T110000Z.db using sqlite3 .backup...
Backup verified (integrity: ok): ./backups/agent-hub-backup-20261102T110000Z.db
```
The script automatically:
- Executes `PRAGMA integrity_check` on the resulting backup.
- Calculates and stores a SHA-256 checksum file alongside the database.

### Automated Nightly Cron
To back up every night at 2:00 AM:
```bash
crontab -e
# Add:
0 2 * * * /home/mayank-sharma/Projects/smt/scripts/backup.sh /home/mayank-sharma/Projects/smt/apps/hub/agent-hub.db /home/mayank-sharma/backups >> /home/mayank-sharma/backups/backup.log 2>&1
```

### Restoring from Backup
```bash
./scripts/restore.sh ./backups/agent-hub-backup-20261102T110000Z.db ./apps/hub/agent-hub.db
```
*Expected Output:*
```text
Verifying backup checksum from ./backups/agent-hub-backup-20261102T110000Z.db.sha256...
./backups/agent-hub-backup-20261102T110000Z.db: OK
Restoring ./backups/agent-hub-backup-20261102T110000Z.db to ./apps/hub/agent-hub.db...
Restore verified successfully: ./apps/hub/agent-hub.db
```

---

## 4. Token Rotation and Revocation

Tokens are 32-byte cryptographically secure random tokens. The Hub stores only their SHA-256 hash.

### Generating a New Member Token
```bash
curl -X POST http://localhost:3000/api/v1/members \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice Developer", "email": "alice@example.com", "role": "developer"}'
```

### Revoking a Member's Access
When a token is compromised or a member departs:
1. List members to find the target `id`:
   ```bash
   curl http://localhost:3000/api/v1/members -H "Authorization: Bearer <ADMIN_TOKEN>"
   ```
2. Revoke the token using SQLite directly or via the API:
   ```bash
   sqlite3 apps/hub/agent-hub.db "UPDATE members SET token_hash = 'REVOKED_' || hex(randomblob(16)) WHERE id = 'mem_target_id';"
   ```
   Any subsequent requests with the old token immediately return `401 Unauthorized`.

---

## 5. Upgrading the Hub

1. Pull the latest commits:
   ```bash
   git pull origin main
   ```
2. Install new dependencies and rebuild all packages:
   ```bash
   pnpm install
   pnpm build
   ```
3. Restart the hub:
   ```bash
   pm2 restart agent-hub
   # Or with systemd:
   sudo systemctl restart agent-hub
   ```
> Schema migrations run automatically upon startup. SQLite migrations are non-destructive and backward compatible.

---

## 6. What to Do When the Host Laptop Sleeps or Restarts

If the host machine sleeps or restarts:
1. **Daemon & Agent Heartbeat Reaper:**
   The hub background reaper runs every 60 seconds. Any tasks claimed by agents that stop sending heartbeats for 30 minutes are automatically transitioned from `in_progress` back to `ready` so other members or runs can resume them.
2. **File Locks TTL:**
   All acquired file locks carry a TTL (default 10 minutes). When an agent goes offline, its locks naturally expire and are unlocked automatically.
3. **Reboot Recovery:**
   If configured with PM2 (`pm2 startup`) or systemd, the Hub server restarts automatically on boot. All task states, locks, events, and audit logs are safely preserved on disk in SQLite WAL mode.
