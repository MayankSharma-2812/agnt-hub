#!/usr/bin/env bash
set -euo pipefail

echo "=== Agent Hub Setup ==="
echo "Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "Node.js is required"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "pnpm is required"; exit 1; }

echo "Installing workspace dependencies..."
pnpm install

echo "Building workspace packages..."
pnpm run build

echo "Setup completed successfully."
