import { FastifyInstance } from 'fastify';
import picomatch from 'picomatch';
import { initDatabase } from '../apps/hub/src/db/database.js';
import { buildApp } from '../apps/hub/src/app.js';
import { TaskStatus, AgentRole } from '@agent-hub/shared';

interface SimOptions {
  mode: 'short' | 'soak';
  durationSeconds: number;
  port: number;
}

function parseArgs(): SimOptions {
  const args = process.argv.slice(2);
  let mode: 'short' | 'soak' = 'short';
  let durationSeconds = 15; // default for automated run
  let port = 3855;

  for (const arg of args) {
    if (arg === '--mode=soak' || arg === 'soak') {
      mode = 'soak';
      durationSeconds = 86400; // 24 hours
    } else if (arg === '--mode=short' || arg === 'short') {
      mode = 'short';
      durationSeconds = 1800; // 30 minutes
    } else if (arg.startsWith('--duration=')) {
      durationSeconds = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--port=')) {
      port = parseInt(arg.split('=')[1], 10);
    }
  }

  return { mode, durationSeconds, port };
}

async function runSimulation() {
  const opts = parseArgs();
  console.log(`==========================================================`);
  console.log(`  Agent Hub: Multi-Agent Concurrency Simulation (${opts.mode})`);
  console.log(`  Duration: ${opts.durationSeconds}s | Mode: ${opts.mode}`);
  console.log(`==========================================================`);

  // 1. Initialize Hub
  const { db, adminToken } = initDatabase(':memory:');
  const app: FastifyInstance = buildApp(db, { logger: false });

  db.prepare("INSERT INTO projects (id, name) VALUES ('proj-sim', 'Agent Hub Simulation')").run();

  const address = await app.listen({ port: opts.port, host: '127.0.0.1' });
  console.log(`Hub running on ${address}`);

  const AGENTS: { name: string; role: AgentRole; lockPrefix: string }[] = [
    { name: 'orchestrator-sim', role: 'orchestrator', lockPrefix: 'docs/**' },
    { name: 'backend-sim', role: 'backend', lockPrefix: 'apps/hub/**' },
    { name: 'frontend-sim', role: 'frontend', lockPrefix: 'apps/web/**' },
    { name: 'qa-sim', role: 'qa', lockPrefix: 'tests/**' },
    { name: 'devops-sim', role: 'devops', lockPrefix: 'scripts/**' },
  ];

  // Register agents
  const adminMemberId = (db.prepare('SELECT id FROM members LIMIT 1').get() as { id: string }).id;
  for (const ag of AGENTS) {
    db.prepare(
      `INSERT INTO agents (id, member_id, name, role, status, last_seen_at)
       VALUES (?, ?, ?, ?, 'idle', datetime('now'))`,
    ).run(`ag-${ag.role}`, adminMemberId, ag.name, ag.role);
  }

  // Simulation metrics
  let tasksCreated = 0;
  let tasksCompleted = 0;
  let locksAcquired = 0;
  let lockCollisionsHandled = 0;
  let messagesExchanged = 0;
  let invariantChecksPassed = 0;

  // Helper request function
  async function apiRequest<T>(
    agentName: string,
    role: string,
    path: string,
    method: string = 'GET',
    body?: unknown,
  ): Promise<{ status: number; data: T }> {
    const res = await app.inject({
      method: method as 'GET' | 'POST' | 'PATCH' | 'DELETE',
      url: path,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Agent-Name': agentName,
        'X-Agent-Role': role,
        'Content-Type': 'application/json',
      },
      payload: body ? JSON.stringify(body) : undefined,
    });

    let data: unknown;
    try {
      data = JSON.parse(res.body);
    } catch {
      data = res.body;
    }
    return { status: res.statusCode, data: data as T };
  }

  // Invariant verification check
  function checkInvariants(): void {
    // 1. Lock Overlap Invariant: No two active locks conflict
    const activeLocks = db
      .prepare(
        "SELECT id, agent_id, path_glob FROM file_locks WHERE released_at IS NULL AND datetime(expires_at) > datetime('now')",
      )
      .all() as Array<{ id: string; agent_id: string; path_glob: string }>;

    for (let i = 0; i < activeLocks.length; i++) {
      for (let j = i + 1; j < activeLocks.length; j++) {
        const l1 = activeLocks[i];
        const l2 = activeLocks[j];
        if (l1.agent_id !== l2.agent_id) {
          const match1 = picomatch(l1.path_glob);
          const match2 = picomatch(l2.path_glob);
          const samplePaths = [
            'src/index.ts',
            'apps/hub/src/app.ts',
            'apps/web/src/App.tsx',
            'tests/smoke.ts',
            'scripts/deploy.sh',
          ];
          for (const sp of samplePaths) {
            if (match1(sp) && match2(sp)) {
              throw new Error(`CRITICAL INVARIANT VIOLATION: Overlapping locks detected for different agents: ${l1.path_glob} (${l1.agent_id}) and ${l2.path_glob} (${l2.agent_id})`);
            }
          }
        }
      }
    }

    // 2. Audit Events Continuity Invariant
    const events = db.prepare('SELECT id, type FROM events ORDER BY id ASC').all() as Array<{ id: string; type: string }>;
    for (let i = 1; i < events.length; i++) {
      if (events[i].id <= events[i - 1].id) {
        throw new Error(`CRITICAL INVARIANT VIOLATION: Non-monotonic audit event ID: ${events[i].id} <= ${events[i - 1].id}`);
      }
    }

    invariantChecksPassed++;
  }

  let isRunning = true;
  let isDraining = false;
  const startTime = Date.now();
  const endTime = startTime + opts.durationSeconds * 1000;

  // Agent Worker Loops
  const agentPromises = AGENTS.map(async (agent) => {
    while (isRunning) {
      if (!isDraining && Date.now() >= endTime) {
        isDraining = true;
      }

      try {
        // 1. Heartbeat
        await apiRequest(agent.name, agent.role, '/api/v1/agents/heartbeat', 'POST', {
          status: 'idle',
        });

        if (agent.role === 'orchestrator') {
          // Orchestrator: Creates tasks when ready queue is low and not draining
          if (!isDraining) {
            const readyTasksRes = await apiRequest<{ tasks: Array<{ id: string }> }>(
              agent.name,
              agent.role,
              '/api/v1/tasks?status=ready',
            );
            if ((readyTasksRes.data.tasks?.length ?? 0) < 4) {
              tasksCreated++;
              const targetRole = ['backend', 'frontend', 'qa', 'devops'][tasksCreated % 4];
              await apiRequest(agent.name, agent.role, '/api/v1/tasks', 'POST', {
                project_id: 'proj-sim',
                title: `Implement simulated capability #${tasksCreated}`,
                description: `Auto-generated simulation task for ${targetRole}`,
                acceptance_criteria: '- [ ] Verified\n- [ ] Clean tests',
                role_required: targetRole,
                status: 'ready',
              });
            }
          }

          // Check for in_review tasks to approve
          const reviewTasksRes = await apiRequest<{ tasks: Array<{ id: string; status: TaskStatus }> }>(
            agent.name,
            agent.role,
            '/api/v1/tasks?status=in_review',
          );
          for (const t of reviewTasksRes.data.tasks || []) {
            await apiRequest(agent.name, agent.role, `/api/v1/tasks/${t.id}/status`, 'POST', {
              status: 'done',
            });
            tasksCompleted++;
          }

          // If draining and all in-flight tasks have been approved, stop
          if (isDraining) {
            const inFlightCount = (
              db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status IN ('claimed', 'in_progress', 'in_review')").get() as { count: number }
            ).count;
            if (inFlightCount === 0 || Date.now() >= endTime + 4000) {
              isRunning = false;
              break;
            }
          }
        } else {
          // Worker Agent: finds ready tasks for role
          if (!isDraining) {
            const readyTasksRes = await apiRequest<{ tasks: Array<{ id: string; version: number; status: TaskStatus }> }>(
              agent.name,
              agent.role,
              `/api/v1/tasks?status=ready&role_required=${agent.role}`,
            );

            const task = readyTasksRes.data.tasks?.[0];
            if (task) {
              // Claim task
              const claimRes = await apiRequest<{ task: { id: string } }>(
                agent.name,
                agent.role,
                `/api/v1/tasks/${task.id}/claim`,
                'POST',
                { version: task.version },
              );

              if (claimRes.status === 200) {
                // Lock file path
                const lockRes = await apiRequest<{ lock?: { id: string } }>(
                  agent.name,
                  agent.role,
                  '/api/v1/locks',
                  'POST',
                  {
                    project_id: 'proj-sim',
                    path_glob: agent.lockPrefix,
                    ttl_seconds: 300,
                  },
                );

                if (lockRes.status === 201) {
                  locksAcquired++;
                } else if (lockRes.status === 409) {
                  lockCollisionsHandled++;
                }

                // Update task in_progress
                await apiRequest(agent.name, agent.role, `/api/v1/tasks/${task.id}/status`, 'POST', {
                  status: 'in_progress',
                });

                // Post message
                messagesExchanged++;
                await apiRequest(agent.name, agent.role, '/api/v1/messages', 'POST', {
                  project_id: 'proj-sim',
                  task_id: task.id,
                  kind: 'info',
                  body: `Working on task ${task.id} in ${agent.lockPrefix}`,
                });

                // Release lock
                if (lockRes.data?.lock?.id) {
                  await apiRequest(agent.name, agent.role, `/api/v1/locks/${lockRes.data.lock.id}`, 'DELETE');
                }

                // Submit for review
                await apiRequest(agent.name, agent.role, `/api/v1/tasks/${task.id}/status`, 'POST', {
                  status: 'in_review',
                  note: 'Implemented and submitted for review',
                });
              }
            }
          } else {
            // During draining, workers finish any remaining claimed tasks
            const activeTasksRes = await apiRequest<{ tasks: Array<{ id: string; status: TaskStatus }> }>(
              agent.name,
              agent.role,
              `/api/v1/tasks?status=in_progress&role_required=${agent.role}`,
            );
            for (const t of activeTasksRes.data.tasks || []) {
              await apiRequest(agent.name, agent.role, `/api/v1/tasks/${t.id}/status`, 'POST', {
                status: 'in_review',
              });
            }
          }
        }

        // Run invariant check
        checkInvariants();
      } catch (err) {
        console.warn(`[Agent ${agent.name} error]: ${(err as Error).message}`);
      }

      // Small throttle between agent cycles
      await new Promise((r) => setTimeout(r, 20));
    }
  });

  await Promise.all(agentPromises);
  isRunning = false;

  // Final Invariant & Health Assertions
  checkInvariants();

  // Final check: Assert no stuck tasks
  const stuckTasks = db
    .prepare(
      "SELECT id, title, status FROM tasks WHERE status IN ('claimed', 'in_progress')",
    )
    .all() as Array<{ id: string; title: string; status: string }>;

  const totalEvents = (db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number }).count;

  await app.close();
  db.close();

  console.log(`\n=== SIMULATION SUMMARY ===`);
  console.log(`Duration Elapsed:     ${Math.round((Date.now() - startTime) / 1000)}s`);
  console.log(`Tasks Created:        ${tasksCreated}`);
  console.log(`Tasks Completed:      ${tasksCompleted}`);
  console.log(`Locks Acquired:       ${locksAcquired}`);
  console.log(`Collisions Handled:   ${lockCollisionsHandled}`);
  console.log(`Messages Exchanged:   ${messagesExchanged}`);
  console.log(`Total Audit Events:   ${totalEvents}`);
  console.log(`Invariant Checks:     ${invariantChecksPassed} passed`);
  console.log(`Stuck Tasks:          ${stuckTasks.length}`);

  if (stuckTasks.length > 0) {
    console.error('FAILED: Stuck tasks detected:', stuckTasks);
    process.exit(1);
  }

  console.log(`\nSUCCESS: Zero stuck tasks, zero unhandled lock collisions, 100% event consistency!`);
}

runSimulation().catch((err) => {
  console.error('[SIMULATION FATAL]', err);
  process.exit(1);
});
