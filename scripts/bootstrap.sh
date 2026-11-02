#!/usr/bin/env bash
# Agent Hub - Fresh Laptop Bootstrap Script (Linux / macOS)
# Idempotent: safe to run multiple times.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

echo "=================================================="
echo "         Agent Hub Environment Bootstrap          "
echo "=================================================="

# 1. Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "[-] ERROR: Node.js is not installed."
  echo "    Please install Node.js >= 20.0.0 (https://nodejs.org/)"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/^v//')
NODE_MAJOR=$(echo "${NODE_VERSION}" | cut -d. -f1)

if [ "${NODE_MAJOR}" -lt 20 ]; then
  echo "[-] ERROR: Node.js version ${NODE_VERSION} detected."
  echo "    Agent Hub requires Node.js >= 20.0.0. Please upgrade Node.js."
  exit 1
fi
echo "[+] Node.js version v${NODE_VERSION} (>= 20.0.0) verified."

# 2. Check Git
if ! command -v git >/dev/null 2>&1; then
  echo "[-] ERROR: Git is not installed."
  echo "    Please install Git (https://git-scm.com/)"
  exit 1
fi
GIT_VERSION=$(git --version)
echo "[+] Git detected: ${GIT_VERSION}"

# 3. Check pnpm
if ! command -v pnpm >/dev/null 2>&1; then
  echo "[!] pnpm is not installed. Attempting installation via corepack..."
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@latest --activate
  else
    echo "[-] ERROR: corepack not found. Please install pnpm globally: npm install -g pnpm"
    exit 1
  fi
fi
PNPM_VERSION=$(pnpm -v)
echo "[+] pnpm detected: v${PNPM_VERSION}"

# 4. Check Antigravity CLI (agy) - Non-fatal warning
if command -v agy >/dev/null 2>&1; then
  AGY_VERSION=$(agy --version 2>/dev/null || echo "installed")
  echo "[+] Antigravity CLI (agy) detected: ${AGY_VERSION}"
else
  echo "[!] Antigravity CLI (agy) not found in PATH."
  echo "    Note: agy is required for running headless autonomous tasks."
  echo "    See docs/guide/SETUP.md for installation instructions."
fi

# 5. Environment configuration (.env)
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    echo "[+] Creating .env from .env.example..."
    cp .env.example .env
  else
    echo "[!] .env.example not found; creating minimal .env..."
    cat << 'EOF' > .env
HUB_URL=http://localhost:3000
HUB_TOKEN=
HUB_AGENT_NAME=agent-local
PORT=3000
HOST=127.0.0.1
DATABASE_PATH=./data/agent-hub.db
EOF
  fi
  echo "[+] .env initialized. Remember to populate HUB_TOKEN after hub startup."
else
  echo "[+] Existing .env file found; preserving settings."
fi

# 6. Install dependencies
echo ""
echo "[-] Installing workspace dependencies via pnpm..."
pnpm install

# 7. Build workspace packages
echo ""
echo "[-] Building workspace packages..."
pnpm run build

echo ""
echo "=================================================="
echo "          Bootstrap Complete! Next Steps:         "
echo "=================================================="
echo ""
echo "1. If you are HOSTING the hub:"
echo "   pnpm --filter @agent-hub/hub dev"
echo "   (Note the generated admin token printed on first startup)"
echo ""
echo "2. If you are a TEAM MEMBER running an agent:"
echo "   a) Get your bearer token from your Hub host / dashboard."
echo "   b) Set HUB_TOKEN in your .env file or run:"
echo "      pnpm --filter @agent-hub/daemon hubd init"
echo "   c) Run system diagnostic self-test:"
echo "      pnpm --filter @agent-hub/daemon hubd doctor"
echo "   d) Start background agent loop:"
echo "      pnpm --filter @agent-hub/daemon hubd start"
echo ""
echo "For full guide, open docs/guide/SETUP.md or docs/guide/CHEATSHEET.md"
echo "=================================================="
