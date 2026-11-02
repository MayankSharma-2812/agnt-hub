#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "    Agent Hub: Milestone M4 hubd Autonomous Task Demo     "
echo "=========================================================="

PORT="${PORT:-3848}"
HUB_HOST="127.0.0.1"
HUB_URL="http://$HUB_HOST:$PORT"

TMP_DIR="$(mktemp -d)"
TMP_DB="$TMP_DIR/demo.db"
BARE_REPO="$TMP_DIR/remote-origin.git"
WORK_REPO="$TMP_DIR/work-repo"
CONFIG_FILE="$TMP_DIR/hubd.json"
HUB_PID=""

cleanup() {
  echo ""
  echo "Cleaning up demo resources..."
  if [ -n "$HUB_PID" ] && kill -0 "$HUB_PID" 2>/dev/null; then
    kill "$HUB_PID" 2>/dev/null || true
    wait "$HUB_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
  echo "Cleaned up."
}
trap cleanup EXIT

echo "1. Initializing bare origin git repo and local clone..."
git init --bare "$BARE_REPO" > /dev/null
git init -b main "$WORK_REPO" > /dev/null
git -C "$WORK_REPO" config user.name "Autonomous Agent"
git -C "$WORK_REPO" config user.email "agent@agent-hub.local"
git -C "$WORK_REPO" remote add origin "$BARE_REPO"
echo "# Demo Codebase" > "$WORK_REPO/README.md"
git -C "$WORK_REPO" add README.md
git -C "$WORK_REPO" commit -m "chore: initial commit" > /dev/null
git -C "$WORK_REPO" push -u origin main > /dev/null
echo "Git remote setup complete."

echo ""
echo "2. Starting Agent Hub on $HUB_URL..."
HUB_DB_PATH="$TMP_DB" PORT="$PORT" HOST="$HUB_HOST" node ./apps/hub/dist/index.js > "$TMP_DIR/hub.log" 2>&1 &
HUB_PID=$!

for i in {1..30}; do
  if curl -s "$HUB_URL/health" | grep -q '"status":"ok"'; then
    break
  fi
  sleep 0.2
done

HUB_TOKEN="$(grep -oP 'Token:\s*\K[a-f0-9]{64}' "$TMP_DIR/hub.log" || true)"
echo "Hub is healthy. Captured Admin Token: ${HUB_TOKEN:0:8}..."

echo ""
echo "3. Creating a sample project on Hub..."
AUTH_HEADER="Authorization: Bearer $HUB_TOKEN"
PROJ_JSON=$(curl -s -X POST "$HUB_URL/api/v1/projects" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"name": "M4 Autonomous Delivery"}')
PROJ_ID=$(echo "$PROJ_JSON" | grep -oP '"id":"\K[^"]+')
echo "Project created: $PROJ_ID"

echo ""
echo "4. Creating task from dashboard simulation (status: ready)..."
TASK_JSON=$(curl -s -X POST "$HUB_URL/api/v1/tasks" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "'"$PROJ_ID"'",
    "title": "Build Automated Database Index Analyzer",
    "description": "Analyze query performance and add missing SQLite indexes.",
    "acceptance_criteria": "- [ ] Indexes created on foreign keys\n- [ ] Benchmarks pass",
    "role_required": "backend",
    "status": "ready"
  }')
TASK_ID=$(echo "$TASK_JSON" | grep -oP '"id":"\K[^"]+')
echo "Task created: $TASK_ID (status: ready)"

echo ""
echo "5. Generating hubd config and executing doctor check..."
FAKE_AGY="$(pwd)/packages/daemon/src/tests/fixtures/fake-agy.js"

node ./packages/daemon/dist/cli.js init --config "$CONFIG_FILE" > /dev/null
# Write configured parameters
node -e '
  const fs = require("fs");
  const cfg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  cfg.hubUrl = process.argv[2];
  cfg.token = process.argv[3];
  cfg.agentName = "backend-runner-m4";
  cfg.role = "backend";
  cfg.repoPath = process.argv[4];
  cfg.agyPath = process.argv[5];
  fs.writeFileSync(process.argv[1], JSON.stringify(cfg, null, 2));
' "$CONFIG_FILE" "$HUB_URL" "$HUB_TOKEN" "$WORK_REPO" "$FAKE_AGY"

node ./packages/daemon/dist/cli.js doctor --config "$CONFIG_FILE"

echo ""
echo "6. Running hubd autonomous cycle (hubd start --once)..."
export FAKE_AGY_MODE="success"
node ./packages/daemon/dist/cli.js start --config "$CONFIG_FILE" --once

echo ""
echo "7. Verifying task completion and pushed branch..."
VERIFY_JSON=$(curl -s "$HUB_URL/api/v1/tasks/$TASK_ID" -H "$AUTH_HEADER")
STATUS=$(echo "$VERIFY_JSON" | grep -oP '"status":"\K[^"]+' | head -n1)
BRANCH=$(echo "$VERIFY_JSON" | grep -oP '"branch":"\K[^"]+' | head -n1)

echo "Task Status: $STATUS"
echo "Assigned Branch: $BRANCH"

if [ "$STATUS" != "in_review" ]; then
  echo "FAILED: Task status is $STATUS, expected in_review"
  exit 1
fi

# Verify branch was pushed to remote bare repo
REMOTE_BRANCHES=$(git -C "$BARE_REPO" branch --list)
if ! echo "$REMOTE_BRANCHES" | grep -q "$BRANCH"; then
  echo "FAILED: Branch $BRANCH was not found in remote repository"
  exit 1
fi

echo "Pushed branch verified in remote git repository!"
echo "Artifacts recorded:"
echo "$VERIFY_JSON" | grep -oP '"artifacts":\[.*?\]' || true

echo ""
echo "=========================================================="
echo "   SUCCESS: Milestone M4 Autonomous Delivery Complete!    "
echo "=========================================================="
