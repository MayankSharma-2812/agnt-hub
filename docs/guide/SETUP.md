# Agent Hub: Getting Started & Setup Guide

Get a teammate with a fresh laptop from zero to a working autonomous agent in under 30 minutes.

---

## 1. Prerequisites Overview

| Component | Minimum Version | Purpose |
| :--- | :--- | :--- |
| **Node.js** | `>= 20.0.0` (LTS recommended) | Runtimes for Hub, MCP shim, and daemon |
| **Git** | `>= 2.30.0` | Monorepo control and git worktrees |
| **pnpm** | `>= 9.0.0` | Monorepo package management |
| **Antigravity IDE** | Latest | AI-first development IDE & MCP host |
| **agy CLI** | Latest | Headless CLI runner used by `hubd` |

---

## 2. Platform-Specific Prerequisites

### A. Linux (Ubuntu / Debian / Fedora)

#### 1. Install Node.js (v20+) & Git
```bash
# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Verify
node -v
git --version
```
*Expected Output:*
```text
v20.x.x (or higher)
git version 2.x.x
```

#### 2. Install pnpm
```bash
corepack enable
corepack prepare pnpm@latest --activate

# Verify
pnpm -v
```
*Expected Output:*
```text
9.x.x (or higher)
```

#### 3. Install Antigravity IDE and `agy` CLI
> Official Antigravity Documentation: [https://antigravity.google/docs](https://antigravity.google/docs)  
> Antigravity CLI Reference: [https://antigravity.google/docs/cli/reference](https://antigravity.google/docs/cli/reference)

*(UNVERIFIED: Host-level installation of proprietary Antigravity desktop packages requires active external browser download)*:
```bash
# [UNVERIFIED] Install Antigravity IDE .deb package:
sudo dpkg -i antigravity-linux-amd64.deb || sudo apt-get install -f -y

# [UNVERIFIED] Install agy CLI globally:
sudo npm install -g @google/antigravity-cli
```
Verify CLI installation:
```bash
agy --version
```
*Expected Output:*
```text
agy v1.x.x
```

---

### B. macOS (Homebrew)

#### 1. Install Node.js, Git, & pnpm
```bash
# [UNVERIFIED: macOS platform commands]
brew install node@20 git pnpm

# Add Node to PATH if required
brew link node@20 --force --overwrite

# Verify
node -v
git --version
pnpm -v
```
*Expected Output:*
```text
v20.x.x
git version 2.x.x
9.x.x
```

#### 2. Install Antigravity IDE and `agy` CLI
> Official Docs: [https://antigravity.google/docs](https://antigravity.google/docs)

```bash
# [UNVERIFIED: macOS platform commands]
brew install --cask antigravity
npm install -g @google/antigravity-cli

# Verify
agy --version
```

---

### C. Windows (PowerShell 7+ / Admin)

#### 1. Install Node.js, Git, & pnpm
Open PowerShell as Administrator:
```powershell
# [UNVERIFIED: Windows platform commands]
winget install OpenJS.NodeJS.LTS
winget install Git.Git
corepack enable
corepack prepare pnpm@latest --activate

# Verify
node -v
git --version
pnpm -v
```
*Expected Output:*
```text
v20.x.x
git version 2.x.x
9.x.x
```

#### 2. Install Antigravity IDE and `agy` CLI
> Official Docs: [https://antigravity.google/docs](https://antigravity.google/docs)

```powershell
# [UNVERIFIED: Windows platform commands]
winget install Google.Antigravity
npm install -g @google/antigravity-cli

# Verify
agy --version
```

---

## 3. Clone and Bootstrap Repository

### Step 1: Clone the Monorepo
```bash
git clone <REPO_URL> smt
cd smt
```

### Step 2: Run Bootstrap
You can bootstrap dependencies, workspace builds, and configuration templates in a single idempotent command:

**On Linux / macOS:**
```bash
./scripts/bootstrap.sh
```

**On Windows (PowerShell):**
```powershell
.\scripts\bootstrap.ps1
```

*Expected Output:*
```text
==================================================
         Agent Hub Environment Bootstrap          
==================================================
[+] Node.js version v24.22.0 (>= 20.0.0) verified.
[+] Git detected: git version 2.53.0
[+] pnpm detected: v12.11.2
[+] Creating .env from .env.example...
[+] .env initialized. Remember to populate HUB_TOKEN after hub startup.

[-] Installing workspace dependencies via pnpm...
Already up to date
[-] Building workspace packages...
✓ built in 718ms
==================================================
          Bootstrap Complete! Next Steps:         
==================================================
```

---

## 4. Member Authentication & Tokens

Agent Hub enforces Bearer Token authentication. Tokens are cryptographically generated 32-byte hex strings whose SHA-256 hashes are stored in the database.

### Option A: You are Hosting the Hub (Admin)
If you are the team member hosting the hub locally or for your team:
```bash
# Start the hub server
pnpm --filter @agent-hub/hub dev
```
On first startup with a fresh database, the server automatically initializes an admin member and prints the token to stdout:
```text
=======================================================
  FIRST START: Admin member created
  Admin Token: 9f7b4c8d123456789abcdef0123456789abcdef0123456789abcdef012345678
  KEEP THIS TOKEN SAFE - IT WILL NOT BE SHOWN AGAIN
=======================================================
[2026-11-02T11:00:00.000Z] INFO: Server listening on http://127.0.0.1:3000
```
Save this token in your `.env`:
```env
HUB_URL=http://localhost:3000
HUB_TOKEN=9f7b4c8d123456789abcdef0123456789abcdef0123456789abcdef012345678
HUB_AGENT_NAME=orchestrator
```

### Option B: You are a Team Member (Non-Admin)
1. Ask the Hub Host for your personal bearer token and the Hub URL (e.g. `https://hub.yourdomain.com`).
2. Alternatively, the host admin can create a member token for you via the REST API or UI:
   ```bash
   # Host executes:
   curl -X POST http://localhost:3000/api/v1/members \
     -H "Authorization: Bearer <ADMIN_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"name": "Mayank Sharma", "email": "mayank@example.com", "role": "developer"}'
   ```
   *Expected Response:*
   ```json
   {
     "member": {
       "id": "mem_01hq...",
       "name": "Mayank Sharma",
       "email": "mayank@example.com",
       "role": "developer"
     },
     "token": "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0"
   }
   ```
3. Set your credentials in `.env`:
   ```env
   HUB_URL=http://localhost:3000
   HUB_TOKEN=a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0
   HUB_AGENT_NAME=backend-agent
   ```

---

## 5. Registering the MCP Shim in Antigravity

Antigravity uses the Model Context Protocol to expose Agent Hub tools (claiming tasks, reading messages, managing locks) to your conversational agent.

### Exact Configuration File Paths:
- **Linux & macOS:** `~/.gemini/config/mcp_config.json`
- **Windows:** `%USERPROFILE%\.gemini\config\mcp_config.json`

### Configuration Content:
Add the `agent-hub` entry to your `mcp_config.json`:

```json
{
  "mcpServers": {
    "agent-hub": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/smt/packages/mcp-shim/dist/index.js"
      ],
      "env": {
        "HUB_URL": "http://localhost:3000",
        "HUB_TOKEN": "YOUR_BEARER_TOKEN",
        "HUB_AGENT_NAME": "backend-agent"
      }
    }
  }
}
```

> **Windows Note:** Ensure backslashes in paths are escaped as `\\` (e.g. `"C:\\Users\\Developer\\Projects\\agent-hub\\packages\\mcp-shim\\dist\\index.js"`).

### Verify MCP Shim Self-Test
Run the `--selftest` flag from your terminal:
```bash
HUB_URL="http://localhost:3000" HUB_TOKEN="<YOUR_TOKEN>" HUB_AGENT_NAME="backend-agent" node packages/mcp-shim/dist/index.js --selftest
```
*Expected Output:*
```text
OK: Authenticated as agent "backend-agent" [registered] for member "Developer"
```

---

## 6. Configuring and Verifying the Daemon (`hubd`)

The daemon runs in the background on your laptop, polling tasks, preparing isolated git worktrees, and executing `agy` headless.

### Step 1: Initialize `hubd` Configuration
```bash
pnpm --filter @agent-hub/daemon hubd init
```
This generates `~/.agent-hub/hubd.json`. Edit this file to match your agent's role and credentials:
```json
{
  "hubUrl": "http://localhost:3000",
  "token": "YOUR_BEARER_TOKEN",
  "agentName": "backend-agent",
  "role": "backend",
  "repoPath": "/absolute/path/to/smt",
  "maxRunsPerDay": 20,
  "runTimeoutMinutes": 45,
  "agyPath": "agy",
  "autoApprove": false,
  "model": null
}
```

### Step 2: Run Diagnostic Doctor
Verify all prerequisites and connectivity in one step:
```bash
pnpm --filter @agent-hub/daemon hubd doctor
```
*Expected Output:*
```text
=== hubd doctor diagnostics ===

✓ [PASS] Node.js Version: v24.22.0 (>= 20.0.0)
✓ [PASS] Git Binary: git version 2.53.0
✓ [PASS] Configuration File: Valid config loaded from ~/.agent-hub/hubd.json
✓ [PASS] Git Repository Path: Valid git repository at /path/to/agent-hub
✓ [PASS] Worktree Directory Writable: Write permissions verified for /path/to/agent-hub/.worktrees
✓ [PASS] Hub Server Connectivity: Hub at http://localhost:3000 is online (status: ok)
✓ [PASS] API Token & Member Authentication: Authenticated as member "Admin"
✓ [PASS] Antigravity CLI (agy): Found executable at agy
✓ [PASS] MCP Shim Self-Test: OK: Authenticated as agent "backend-agent" [registered] for member "Admin"

----------------------------------------
Overall Status: PASS
----------------------------------------
```

---

## 7. First-Task Smoke Test

Confirm the full loop works from end to end:

1. **Start the Hub and Web Dashboard:**
   ```bash
   pnpm --filter @agent-hub/hub dev
   ```
   Open `http://localhost:3000` in your browser.

2. **Create a Smoke Test Task:**
   Via the UI (+ New Task) or curl:
   ```bash
   curl -X POST http://localhost:3000/api/v1/tasks \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Smoke test daemon execution",
       "description": "Verify autonomous worktree creation and commit flow.",
       "role_required": "backend",
       "acceptance_criteria": "A smoke file exists in repo."
     }'
   ```
   *Expected Response Status:* `201 Created`

3. **Start the Daemon:**
   ```bash
   pnpm --filter @agent-hub/daemon hubd start
   ```
   Check daemon execution logs:
   ```bash
   pnpm --filter @agent-hub/daemon hubd status
   ```
   The daemon will claim the task, create `.worktrees/agent-backend-<task_id>`, execute the runner, commit any modified files, push the branch `agent/backend/<task_id>-smoke-test`, and submit the task for review.
