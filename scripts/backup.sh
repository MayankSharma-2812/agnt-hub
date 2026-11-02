#!/usr/bin/env bash
set -euo pipefail

DB_FILE="${1:-./apps/hub/agent-hub.db}"
DEST="${2:-./backups}"

if [ ! -f "$DB_FILE" ]; then
  echo "Database file $DB_FILE does not exist. Nothing to back up."
  exit 1
fi

if [[ "$DEST" == *.db ]]; then
  BACKUP_FILE="$DEST"
  BACKUP_DIR="$(dirname "$BACKUP_FILE")"
else
  BACKUP_DIR="$DEST"
  TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
  BACKUP_FILE="$BACKUP_DIR/agent-hub-backup-$TIMESTAMP.db"
fi

mkdir -p "$BACKUP_DIR"

echo "Backing up $DB_FILE to $BACKUP_FILE using sqlite3 .backup..."
sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"

# Run integrity check on the backup
INTEGRITY="$(sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;")"
if [ "$INTEGRITY" != "ok" ]; then
  echo "Backup integrity check failed: $INTEGRITY"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Generate SHA256 checksum
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
fi

echo "Backup verified (integrity: ok): $BACKUP_FILE"
