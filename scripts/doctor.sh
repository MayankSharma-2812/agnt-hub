#!/usr/bin/env bash
set -euo pipefail

echo "=== Agent Hub System Doctor ==="

check_cmd() {
  local cmd="$1"
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "✓ $cmd is installed ($(command -v "$cmd"))"
  else
    echo "✗ $cmd is NOT installed"
  fi
}

check_cmd "node"
check_cmd "pnpm"
check_cmd "git"
check_cmd "sqlite3"
check_cmd "agy"

echo "Doctor check complete."
