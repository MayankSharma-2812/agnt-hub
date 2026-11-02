#!/usr/bin/env bash
set -euo pipefail

DB_FILE="${1:-./apps/hub/agent-hub.db}"
BACKUP_DIR="${2:-./backups}"

if [ ! -f "$DB_FILE" ]; then
  echo "Database file $DB_FILE does not exist. Nothing to back up."
  exit 0
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
BACKUP_FILE="$BACKUP_DIR/agent-hub-backup-$TIMESTAMP.db"

echo "Backing up $DB_FILE to $BACKUP_FILE using sqlite3 .backup..."
sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
echo "Backup completed: $BACKUP_FILE"
