import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { HubClient, HubClientError } from './client.js';

export function formatOutput(summary: string, data?: unknown): { content: [{ type: 'text'; text: string }] } {
  let text = summary;
  if (data !== undefined) {
    text += `\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  }
  return {
    content: [{ type: 'text', text }],
  };
}

export function formatError(err: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  if (err instanceof HubClientError) {
    const text = `Error [${err.code}]: ${err.message}\nNext Steps: ${err.guidance}`;
    return {
      content: [{ type: 'text', text }],
      isError: true,
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text', text: `Unexpected Error: ${msg}\nNext Steps: Check connection or retry.` }],
    isError: true,
  };
}

export function registerTools(server: McpServer, client: HubClient): void {
  // 1. hub_whoami
  server.tool(
    'hub_whoami',
    'Returns authenticated member identity, calling agent name, role, and server status',
    {},
    async () => {
      try {
        const res = await client.request<{
          member: { id: string; name: string; email?: string; is_admin: number };
          current_agent?: { id: string; name: string; role: string; status: string } | null;
        }>('/api/v1/me');

        const summary = `Authenticated as member "${res.member.name}" (Admin: ${res.member.is_admin === 1 ? 'yes' : 'no'}). ` +
          `Active agent: "${res.current_agent?.name ?? client.agentName}" [${res.current_agent?.role ?? 'unregistered'}].`;

        return formatOutput(summary, res);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 2. hub_heartbeat
  server.tool(
    'hub_heartbeat',
    'Reports agent presence, status, and current task assignment to prevent task reaping',
    {
      status: z.enum(['idle', 'working', 'blocked', 'offline']).describe('Current agent operational status'),
      task_id: z.string().optional().describe('ID of the task currently being worked on'),
    },
    async ({ status, task_id }) => {
      try {
        const res = await client.request<{ agent: { id: string; name: string; status: string; current_task_id: string | null } }>(
          '/api/v1/agents/heartbeat',
          {
            method: 'POST',
            body: { status, current_task_id: task_id ?? null },
          },
        );

        const summary = `Heartbeat updated: Agent "${res.agent.name}" is now ${res.agent.status}.`;
        return formatOutput(summary, res.agent);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 3. hub_list_tasks
  server.tool(
    'hub_list_tasks',
    'Lists tasks matching status, required role, or assigned agent',
    {
      status: z.enum(['backlog', 'ready', 'claimed', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled']).optional().describe('Filter by task status'),
      role: z.enum(['orchestrator', 'backend', 'frontend', 'qa', 'devops', 'reviewer']).optional().describe('Filter by required agent role'),
      project_id: z.string().optional().describe('Filter by project ID'),
    },
    async ({ status, role, project_id }) => {
      try {
        const res = await client.request<{ tasks: Array<{ id: string; title: string; status: string; role_required?: string; priority: number; version: number }> }>(
          '/api/v1/tasks',
          {
            query: { status, role, project: project_id },
          },
        );

        const count = res.tasks.length;
        const summary = `Found ${count} task(s)${status ? ` with status '${status}'` : ''}${role ? ` for role '${role}'` : ''}.`;
        return formatOutput(summary, res.tasks);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 4. hub_get_task
  server.tool(
    'hub_get_task',
    'Retrieves full task details including dependencies, messages, artifacts, and execution runs',
    {
      task_id: z.string().describe('The ULID identifier of the task'),
    },
    async ({ task_id }) => {
      try {
        const res = await client.request<{
          task: { id: string; title: string; status: string; version: number; acceptance_criteria: string; branch: string | null };
          dependencies: unknown[];
          messages: unknown[];
          artifacts: unknown[];
        }>(`/api/v1/tasks/${task_id}`);

        const summary = `Task "${res.task.title}" [${res.task.status}] (Version: ${res.task.version}).`;
        return formatOutput(summary, res);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 5. hub_claim_task
  server.tool(
    'hub_claim_task',
    'Claims a ready task for this agent using optimistic concurrency control',
    {
      task_id: z.string().describe('The ULID identifier of the task to claim'),
      version: z.number().int().optional().describe('The expected task version for optimistic locking'),
    },
    async ({ task_id, version }) => {
      try {
        const res = await client.request<{ task: { id: string; title: string; status: string; version: number; assignee_agent_id: string } }>(
          `/api/v1/tasks/${task_id}/claim`,
          {
            method: 'POST',
            body: { version },
          },
        );

        const summary = `Task "${res.task.title}" claimed successfully. Status: ${res.task.status}, Version: ${res.task.version}. Next: Lock needed files and create branch.`;
        return formatOutput(summary, res.task);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 6. hub_update_task_status
  server.tool(
    'hub_update_task_status',
    'Transitions a task along allowed status paths (e.g. in_progress, blocked, in_review, done)',
    {
      task_id: z.string().describe('The task ID'),
      status: z.enum(['ready', 'in_progress', 'blocked', 'in_review', 'done', 'cancelled']).describe('Target status'),
      note: z.string().optional().describe('Context note or reason for status change'),
      branch: z.string().optional().describe('Git branch associated with task'),
      pr_url: z.string().optional().describe('Pull request URL (required when transitioning to in_review)'),
    },
    async ({ task_id, status, note, branch, pr_url }) => {
      try {
        const res = await client.request<{ task: { id: string; title: string; status: string; version: number } }>(
          `/api/v1/tasks/${task_id}/status`,
          {
            method: 'POST',
            body: { status, note, branch, pr_url },
          },
        );

        const summary = `Task "${res.task.title}" transitioned to '${res.task.status}'. Version: ${res.task.version}.`;
        return formatOutput(summary, res.task);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 7. hub_create_task
  server.tool(
    'hub_create_task',
    'Creates a new task with acceptance criteria, role assignment, and dependencies (Orchestrator role)',
    {
      title: z.string().min(1).describe('Concise title for the task'),
      description: z.string().optional().describe('Detailed task scope'),
      acceptance_criteria: z.string().optional().describe('Definition of done / verification criteria'),
      role_required: z.enum(['orchestrator', 'backend', 'frontend', 'qa', 'devops', 'reviewer']).optional().describe('Required agent role'),
      priority: z.number().int().min(1).max(3).optional().default(2).describe('Priority: 1 (high), 2 (normal), 3 (low)'),
      depends_on: z.array(z.string()).optional().describe('List of task IDs this task depends on'),
      project_id: z.string().optional().describe('Project ID (if omitted, first project is selected)'),
    },
    async ({ title, description, acceptance_criteria, role_required, priority, depends_on, project_id }) => {
      try {
        let targetProject = project_id;
        if (!targetProject) {
          const projectsRes = await client.request<{ projects: Array<{ id: string }> }>('/api/v1/projects');
          if (projectsRes.projects.length === 0) {
            throw new Error('No project found. Please create a project first.');
          }
          targetProject = projectsRes.projects[0].id;
        }

        const res = await client.request<{ task: { id: string; title: string; status: string; role_required: string | null } }>(
          '/api/v1/tasks',
          {
            method: 'POST',
            body: {
              project_id: targetProject,
              title,
              description: description ?? '',
              acceptance_criteria: acceptance_criteria ?? '',
              role_required: role_required ?? null,
              priority: priority ?? 2,
              depends_on: depends_on ?? [],
            },
          },
        );

        const summary = `Task created: "${res.task.title}" [ID: ${res.task.id}, Status: ${res.task.status}].`;
        return formatOutput(summary, res.task);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 8. hub_send_message
  server.tool(
    'hub_send_message',
    'Sends a coordinated message or blocker to another agent or broadcasts to everyone',
    {
      kind: z.enum(['info', 'question', 'answer', 'handoff', 'blocker', 'review_request']).describe('Message category'),
      body: z.string().min(1).describe('Message content (keep short, 1-5 lines)'),
      to: z.string().optional().describe('Recipient agent ID (omit for broadcast)'),
      task_id: z.string().optional().describe('Related task ID'),
      project_id: z.string().optional().describe('Project ID'),
    },
    async ({ kind, body, to, task_id, project_id }) => {
      try {
        let targetProject = project_id;
        if (!targetProject) {
          const projectsRes = await client.request<{ projects: Array<{ id: string }> }>('/api/v1/projects');
          targetProject = projectsRes.projects[0]?.id;
        }

        const res = await client.request<{ message: { id: string; kind: string; to_agent_id: string | null; body: string } }>(
          '/api/v1/messages',
          {
            method: 'POST',
            body: {
              project_id: targetProject,
              task_id: task_id ?? null,
              to_agent_id: to ?? null,
              kind,
              body,
            },
          },
        );

        const summary = `Sent ${res.message.kind} message${to ? ` to agent ${to}` : ' (broadcast)'}.`;
        return formatOutput(summary, res.message);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 9. hub_read_inbox
  server.tool(
    'hub_read_inbox',
    'Reads unread messages for this agent and automatically marks returned messages as read',
    {
      limit: z.number().int().positive().optional().default(10).describe('Maximum number of unread messages to retrieve'),
      task_id: z.string().optional().describe('Filter by specific task ID'),
    },
    async ({ limit, task_id }) => {
      try {
        const res = await client.request<{ messages: Array<{ id: string; kind: string; body: string; from_agent_id?: string; task_id?: string }> }>(
          '/api/v1/messages',
          {
            query: { unread: 'true', task: task_id },
          },
        );

        const unread = res.messages.slice(0, limit);

        // Mark returned messages as read
        for (const msg of unread) {
          try {
            await client.request(`/api/v1/messages/${msg.id}/read`, { method: 'POST' });
          } catch {
            // Best effort mark read
          }
        }

        const summary = unread.length === 0
          ? 'Inbox is empty. No new unread messages.'
          : `Retrieved ${unread.length} unread message(s) and marked as read.`;

        return formatOutput(summary, unread);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 10. hub_lock_files
  server.tool(
    'hub_lock_files',
    'Locks file path globs before editing to prevent merge conflicts; returns conflict info if locked',
    {
      paths: z.union([z.string(), z.array(z.string())]).describe('Path glob or array of globs to lock (e.g. apps/hub/src/**)'),
      task_id: z.string().optional().describe('Associated task ID'),
      ttl_minutes: z.number().int().positive().optional().default(120).describe('Lock duration in minutes (default: 120)'),
      project_id: z.string().optional().describe('Project ID'),
    },
    async ({ paths, task_id, ttl_minutes, project_id }) => {
      try {
        let targetProject = project_id;
        if (!targetProject) {
          const projectsRes = await client.request<{ projects: Array<{ id: string }> }>('/api/v1/projects');
          targetProject = projectsRes.projects[0]?.id;
        }

        const globList = Array.isArray(paths) ? paths : [paths];
        const acquiredLocks: unknown[] = [];

        for (const glob of globList) {
          const res = await client.request<{ lock: { id: string; path_glob: string; expires_at: string } }>(
            '/api/v1/locks',
            {
              method: 'POST',
              body: {
                project_id: targetProject,
                task_id: task_id ?? null,
                path_glob: glob,
                ttl_minutes: ttl_minutes ?? 120,
              },
            },
          );
          acquiredLocks.push(res.lock);
        }

        const summary = `Locked ${acquiredLocks.length} path pattern(s) for ${ttl_minutes ?? 120} minutes.`;
        return formatOutput(summary, acquiredLocks);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 11. hub_release_locks
  server.tool(
    'hub_release_locks',
    'Releases active file locks held by the agent (by lock ID or all locks for a task)',
    {
      lock_id: z.string().optional().describe('Specific lock ID to release'),
      task_id: z.string().optional().describe('Release all locks held for this task ID'),
    },
    async ({ lock_id, task_id }) => {
      try {
        if (lock_id) {
          await client.request(`/api/v1/locks/${lock_id}`, { method: 'DELETE' });
          return formatOutput(`Released lock ID ${lock_id}.`, { lock_id });
        }

        // Find active locks held by agent
        const locksRes = await client.request<{ locks: Array<{ id: string; task_id?: string }> }>('/api/v1/locks');
        const toRelease = task_id
          ? locksRes.locks.filter((l) => l.task_id === task_id)
          : locksRes.locks;

        for (const l of toRelease) {
          await client.request(`/api/v1/locks/${l.id}`, { method: 'DELETE' });
        }

        const summary = `Released ${toRelease.length} file lock(s).`;
        return formatOutput(summary, { released_count: toRelease.length });
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 12. hub_add_artifact
  server.tool(
    'hub_add_artifact',
    'Attaches a plan, diff, test report, screenshot, doc, or PR link to a task',
    {
      task_id: z.string().describe('Target task ID'),
      kind: z.enum(['plan', 'diff', 'test_report', 'screenshot', 'doc', 'pr', 'link']).describe('Artifact classification'),
      title: z.string().min(1).describe('Descriptive title for artifact'),
      uri: z.string().min(1).describe('URI or URL to the artifact (e.g. PR URL, file path, report)'),
      summary: z.string().optional().describe('Short summary of artifact contents'),
    },
    async ({ task_id, kind, title, uri, summary }) => {
      try {
        const res = await client.request<{ artifact: { id: string; title: string; kind: string; uri: string } }>(
          '/api/v1/artifacts',
          {
            method: 'POST',
            body: { task_id, kind, title, uri, summary: summary ?? null },
          },
        );

        const summaryText = `Artifact attached: "${res.artifact.title}" [${res.artifact.kind}].`;
        return formatOutput(summaryText, res.artifact);
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
