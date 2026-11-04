#!/usr/bin/env bash
set -e

HUB_URL="http://localhost:3000"
TOKEN="0448fc35bf9a0c17b631fae4a5011a3e9f723a04bf211554336615f1d5c223a7"
PROJECT_ID="01M6DK37SMSA6QR4N7K4K4SR9N"

echo "=== 🎬 Starting Live Agent Hub Demo Sequence ==="

# Auto-cleanup any previous demo tasks so the board starts completely clean
sqlite3 /home/mayank-sharma/Projects/smt/apps/hub/agent-hub.db "
DELETE FROM file_locks WHERE task_id IN (SELECT id FROM tasks WHERE title = 'Implement Autonomous Redis Cache');
DELETE FROM tasks WHERE title = 'Implement Autonomous Redis Cache';
" 2>/dev/null || true

# 1. Create a Task
echo "1️⃣ Creating task: 'Implement Autonomous Redis Cache'..."
CREATE_RES=$(curl -s -X POST "$HUB_URL/api/v1/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"project_id\": \"$PROJECT_ID\", \"title\": \"Implement Autonomous Redis Cache\", \"role_required\": \"backend\", \"priority\": 1}")

TASK_ID=$(echo "$CREATE_RES" | grep -o '"id":"[^"]*' | head -n 1 | cut -d'"' -f4)
echo "   ↳ Created Task ID: $TASK_ID (Status: Ready)"

sleep 2

# 2. Claim the Task
echo "2️⃣ Agent 'backend-agent' claiming task..."
curl -s -X POST "$HUB_URL/api/v1/tasks/$TASK_ID/claim" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Name: backend-agent" \
  -H "X-Agent-Role: backend" \
  -H "Content-Type: application/json" \
  -d '{"version": 1}' > /dev/null
echo "   ↳ Status updated: Claimed"

sleep 2

# 3. Lock Files
echo "3️⃣ Agent acquiring exclusive file lock on 'apps/hub/src/cache/**'..."
curl -s -X POST "$HUB_URL/api/v1/locks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Name: backend-agent" \
  -H "X-Agent-Role: backend" \
  -H "Content-Type: application/json" \
  -d "{\"project_id\": \"$PROJECT_ID\", \"task_id\": \"$TASK_ID\", \"path_glob\": \"apps/hub/src/cache/**\", \"ttl_seconds\": 300}" > /dev/null
echo "   ↳ File lock acquired!"

sleep 1

# 4. Move to In Progress
echo "4️⃣ Agent starting work..."
curl -s -X POST "$HUB_URL/api/v1/tasks/$TASK_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Name: backend-agent" \
  -H "X-Agent-Role: backend" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress", "version": 2}' > /dev/null
echo "   ↳ Status updated: In Progress"

sleep 3

# 5. Move to In Review
echo "5️⃣ Agent completed work. Submitting for review..."
curl -s -X POST "$HUB_URL/api/v1/tasks/$TASK_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Name: backend-agent" \
  -H "X-Agent-Role: backend" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_review", "version": 3}' > /dev/null
echo "   ↳ Status updated: In Review"

echo "=== ✅ Demo Sequence Complete! ==="
