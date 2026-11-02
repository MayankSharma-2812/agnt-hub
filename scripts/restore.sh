#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
TARGET_DB="${2:-}"

if [ -z "$BACKUP_FILE" ] || [ -z "$TARGET_DB" ]; then
  echo "Usage: scripts/restore.sh <backup-file.db> <target-db.db>"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file $BACKUP_FILE not found."
  exit 1
fi

# Verify checksum if present
CHECKSUM_FILE="$BACKUP_FILE.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
  echo "Verifying backup checksum from $CHECKSUM_FILE..."
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "$CHECKSUM_FILE"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c "$CHECKSUM_FILE"
  fi
fi

# Verify integrity of backup file before restoring
INTEGRITY="$(sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;")"
if [ "$INTEGRITY" != "ok" ]; then
  echo "Cannot restore: backup file integrity check returned: $INTEGRITY"
  exit 1
fi

TARGET_DIR="$(dirname "$TARGET_DB")"
mkdir -p "$TARGET_DIR"

# Restore database safely into target
echo "Restoring $BACKUP_FILE to $TARGET_DB..."
sqlite3 "$BACKUP_FILE" ".backup '$TARGET_DB'"

# Ensure WAL mode and verify target integrity
sqlite3 "$TARGET_DB" "PRAGMA journal_mode = WAL; PRAGMA integrity_check;" > /dev/null

echo "Restore verified successfully: $TARGET_DB"
