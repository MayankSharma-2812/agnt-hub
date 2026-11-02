# Agent Hub - Fresh Laptop Bootstrap Script (Windows PowerShell)
# Idempotent: safe to run multiple times.
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
Set-Location $repoRoot

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "         Agent Hub Environment Bootstrap          " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Check Node.js
try {
    $nodeVerRaw = & node -v
    $nodeVer = $nodeVerRaw.TrimStart("v")
    $nodeMajor = [int]($nodeVer.Split(".")[0])
    if ($nodeMajor -lt 20) {
        Write-Error "[-] ERROR: Node.js version $nodeVer detected. Agent Hub requires Node.js >= 20.0.0."
        exit 1
    }
    Write-Host "[+] Node.js version v$nodeVer (>= 20.0.0) verified." -ForegroundColor Green
} catch {
    Write-Error "[-] ERROR: Node.js is not installed or not in PATH. Please install Node.js >= 20 (https://nodejs.org/)."
    exit 1
}

# 2. Check Git
try {
    $gitVer = (& git --version).Trim()
    Write-Host "[+] Git detected: $gitVer" -ForegroundColor Green
} catch {
    Write-Error "[-] ERROR: Git is not installed or not in PATH. Please install Git (https://git-scm.com/)."
    exit 1
}

# 3. Check pnpm
$pnpmCmd = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpmCmd) {
    Write-Host "[!] pnpm is not installed. Attempting installation via corepack..." -ForegroundColor Yellow
    try {
        & corepack enable
        & corepack prepare pnpm@latest --activate
        Write-Host "[+] pnpm activated via corepack." -ForegroundColor Green
    } catch {
        Write-Error "[-] ERROR: corepack failed to activate pnpm. Please run: npm install -g pnpm"
        exit 1
    }
} else {
    $pnpmVer = (& pnpm -v).Trim()
    Write-Host "[+] pnpm detected: v$pnpmVer" -ForegroundColor Green
}

# 4. Check Antigravity CLI (agy) - Non-fatal warning
$agyCmd = Get-Command agy -ErrorAction SilentlyContinue
if ($agyCmd) {
    Write-Host "[+] Antigravity CLI (agy) detected." -ForegroundColor Green
} else {
    Write-Host "[!] Antigravity CLI (agy) not found in PATH." -ForegroundColor Yellow
    Write-Host "    Note: agy is required for running headless autonomous tasks." -ForegroundColor Yellow
    Write-Host "    See docs/guide/SETUP.md for installation details." -ForegroundColor Yellow
}

# 5. Environment configuration (.env)
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Write-Host "[+] Creating .env from .env.example..." -ForegroundColor Green
        Copy-Item ".env.example" ".env"
    } else {
        Write-Host "[!] .env.example not found; creating minimal .env..." -ForegroundColor Yellow
        @"
HUB_URL=http://localhost:3000
HUB_TOKEN=
HUB_AGENT_NAME=agent-local
PORT=3000
HOST=127.0.0.1
DATABASE_PATH=./data/agent-hub.db
"@ | Out-File -Encoding utf8 ".env"
    }
    Write-Host "[+] .env initialized. Remember to populate HUB_TOKEN after hub startup." -ForegroundColor Green
} else {
    Write-Host "[+] Existing .env file found; preserving settings." -ForegroundColor Green
}

# 6. Install dependencies
Write-Host ""
Write-Host "[-] Installing workspace dependencies via pnpm..." -ForegroundColor Cyan
& pnpm install

# 7. Build workspace packages
Write-Host ""
Write-Host "[-] Building workspace packages..." -ForegroundColor Cyan
& pnpm run build

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "          Bootstrap Complete! Next Steps:         " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. If you are HOSTING the hub:"
Write-Host "   pnpm --filter @agent-hub/hub dev"
Write-Host "   (Note the generated admin token printed on first startup)"
Write-Host ""
Write-Host "2. If you are a TEAM MEMBER running an agent:"
Write-Host "   a) Get your bearer token from your Hub host / dashboard."
Write-Host "   b) Set HUB_TOKEN in your .env file or run:"
Write-Host "      pnpm --filter @agent-hub/daemon hubd init"
Write-Host "   c) Run system diagnostic self-test:"
Write-Host "      pnpm --filter @agent-hub/daemon hubd doctor"
Write-Host "   d) Start background agent loop:"
Write-Host "      pnpm --filter @agent-hub/daemon hubd start"
Write-Host ""
Write-Host "For full guide, open docs/guide/SETUP.md or docs/guide/CHEATSHEET.md"
Write-Host "==================================================" -ForegroundColor Cyan
