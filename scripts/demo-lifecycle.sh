#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "      Agent Hub: End-to-End Task Lifecycle Demo (curl)    "
echo "=========================================================="

HUB_PORT="${PORT:-3847}"
HUB_HOST="127.0.0.1"
HUB_URL="${HUB_URL:-http://$HUB_HOST:$HUB_PORT}"
TMP_DB_DIR="$(mktemp -d)"
TMP_DB="$TMP_DB_DIR/demo.db"
HUB_PID=""

cleanup() {
  if [ -n "$HUB_PID" ] && kill -0 "$HUB_PID" 2>/dev/null; then
    echo "Shutting down temporary hub server (PID $HUB_PID)..."
    kill "$HUB_PID" 2>/dev/null || true
    wait "$HUB_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DB_DIR"
}
trap cleanup EXIT

if [ -z "${HUB_TOKEN:-}" ]; then
  echo "1. Starting temporary Agent Hub server on $HUB_URL..."
  HUB_DB_PATH="$TMP_DB" PORT="$HUB_PORT" HOST="$HUB_HOST" node ./apps/hub/dist/index.js > "$TMP_DB_DIR/server.log" 2>&1 &
  HUB_PID=$!

  echo "Waiting for server to become healthy..."
  for i in {1..30}; do
    if curl -s "$HUB_URL/health" | grep -q '"status":"ok"'; then
      break
    fi
    sleep 0.2
  done

  # Extract bootstrap admin token from log
  HUB_TOKEN="$(grep -oP 'Initial Admin Token Generated:\s*\K[a-f0-9]{64}' "$TMP_DB_DIR/server.log" || true)"
  if [ -z "$HUB_TOKEN" ]; then
    HUB_TOKEN="$(grep -oP 'Token:\s*\K[a-f0-9]{64}' "$TMP_DB_DIR/server.log" || true)"
  fi
  echo "Captured Admin Token: ${HUB_TOKEN:0:8}..."
else
  echo "Using existing HUB_URL: $HUB_URL with provided HUB_TOKEN."
fi

AUTH_HEADER="Authorization: Bearer $HUB_TOKEN"

echo ""
echo "2. Healthcheck GET /health"
curl -s -f "$HUB_URL/health" | jq .

echo ""
echo "3. Identity GET /api/v1/me"
curl -s -f -H "$AUTH_HEADER" "$HUB_URL/api/v1/me" | jq .

echo ""
echo "4. Create Project POST /api/v1/projects"
PROJECT_RESP=$(curl -s -f -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"name": "Lifecycle Demo Project", "repo_url": "https://github.com/org/demo"}' \
  "$HUB_URL/api/v1/projects")
echo "$PROJECT_RESP" | jq .
PROJECT_ID=$(echo "$PROJECT_RESP" | jq -r .project.id)

echo ""
echo "5. Create Task POST /api/v1/tasks"
TASK_RESP=$(curl -s -f -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d "{\"project_id\": \"$PROJECT_ID\", \"title\": \"Implement Authentication Middleware\", \"role_required\": \"backend\", \"priority\": 1}" \
  "$HUB_URL/api/v1/tasks")
echo "$TASK_RESP" | jq .
TASK_ID=$(echo "$TASK_RESP" | jq -r .task.id)
TASK_VERSION=$(echo "$TASK_RESP" | jq -r .task.version)

echo ""
echo "6. Claim Task POST /api/v1/tasks/:id/claim (as backend-agent)"
CLAIM_RESP=$(curl -s -f -H "$AUTH_HEADER" -H "X-Agent-Name: backend-agent" -H "Content-Type: application/json" \
  -d "{\"version\": $TASK_VERSION}" \
  "$HUB_URL/api/v1/tasks/$TASK_ID/claim")
echo "$CLAIM_RESP" | jq .
TASK_VERSION=$(echo "$CLAIM_RESP" | jq -r .task.version)

echo ""
echo "7. Acquire File Lock POST /api/v1/locks"
LOCK_RESP=$(curl -s -f -H "$AUTH_HEADER" -H "X-Agent-Name: backend-agent" -H "Content-Type: application/json" \
  -d "{\"project_id\": \"$PROJECT_ID\", \"task_id\": \"$TASK_ID\", \"path_glob\": \"apps/hub/src/services/auth.ts\", \"ttl_minutes\": 60}" \
  "$HUB_URL/api/v1/locks")
echo "$LOCK_RESP" | jq .
LOCK_ID=$(echo "$LOCK_RESP" | jq -r .lock.id)

echo ""
echo "8. Transition Task to in_progress POST /api/v1/tasks/:id/status"
IN_PROG_RESP=$(curl -s -f -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"status": "in_progress", "branch": "agent/backend/auth-middleware"}' \
  "$HUB_URL/api/v1/tasks/$TASK_ID/status")
echo "$IN_PROG_RESP" | jq .

echo ""
echo "9. Send Question Message POST /api/v1/messages"
MSG_RESP=$(curl -s -f -H "$AUTH_HEADER" -H "X-Agent-Name: backend-agent" -H "Content-Type: application/json" \
  -d "{\"project_id\": \"$PROJECT_ID\", \"task_id\": \"$TASK_ID\", \"kind\": \"info\", \"body\": \"Started working on auth middleware.\"}" \
  "$HUB_URL/api/v1/messages")
echo "$MSG_RESP" | jq .

echo ""
echo "10. Report Agent Run POST /api/v1/runs"
RUN_RESP=$(curl -s -f -H "$AUTH_HEADER" -H "X-Agent-Name: backend-agent" -H "Content-Type: application/json" \
  -d "{\"task_id\": \"$TASK_ID\", \"model\": \"gemini-2.5-pro\", \"status\": \"running\"}" \
  "$HUB_URL/api/v1/runs")
echo "$RUN_RESP" | jq .
RUN_ID=$(echo "$RUN_RESP" | jq -r .run.id)

echo ""
echo "11. Finish Agent Run PATCH /api/v1/runs/:id"
curl -s -f -X PATCH -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"status": "succeeded", "exit_code": 0, "note": "Unit tests pass"}' \
  "$HUB_URL/api/v1/runs/$RUN_ID" | jq .

echo ""
echo "12. Attach PR Artifact POST /api/v1/artifacts"
curl -s -f -H "$AUTH_HEADER" -H "X-Agent-Name: backend-agent" -H "Content-Type: application/json" \
  -d "{\"task_id\": \"$TASK_ID\", \"kind\": \"pr\", \"title\": \"PR #12: Auth Middleware\", \"uri\": \"https://github.com/org/repo/pull/12\"}" \
  "$HUB_URL/api/v1/artifacts" | jq .

echo ""
echo "13. Release File Lock DELETE /api/v1/locks/:id"
curl -s -f -X DELETE -H "$AUTH_HEADER" -H "X-Agent-Name: backend-agent" \
  "$HUB_URL/api/v1/locks/$LOCK_ID" | jq .

echo ""
echo "14. Move Task to in_review POST /api/v1/tasks/:id/status"
curl -s -f -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"status": "in_review", "pr_url": "https://github.com/org/repo/pull/12"}' \
  "$HUB_URL/api/v1/tasks/$TASK_ID/status" | jq .

echo ""
echo "15. Human Merge: Move Task to done POST /api/v1/tasks/:id/status"
FINAL_TASK=$(curl -s -f -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"status": "done"}' \
  "$HUB_URL/api/v1/tasks/$TASK_ID/status")
echo "$FINAL_TASK" | jq .

echo ""
echo "16. Fetch Audit Events Log GET /api/v1/events"
curl -s -f -H "$AUTH_HEADER" "$HUB_URL/api/v1/events" | jq '{ total_events: (.events | length), sample_types: [.events[].type] }'

echo ""
echo "=========================================================="
echo "✓ Task lifecycle demo completed successfully!"
echo "=========================================================="
