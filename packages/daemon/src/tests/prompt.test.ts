import { describe, it, expect } from 'vitest';
import { buildTaskPrompt } from '../prompt.js';
import { Task, Message } from '@agent-hub/shared';

describe('Task Prompt Assembler', () => {
  it('assembles a structured prompt containing task details, criteria, discussion, and docs', () => {
    const task: Task = {
      id: 'task-42',
      project_id: 'proj-1',
      title: 'Fix Race Condition in Hub Claim',
      description: 'Concurrent claims currently risk two winners without optimistic lock.',
      acceptance_criteria: '- [ ] Enforce version equality\n- [ ] Concurrency test passes',
      role_required: 'backend',
      priority: 1,
      status: 'ready',
      version: 3,
      branch: null,
      pr_url: null,
      created_at: '2026-11-02T08:00:00Z',
      updated_at: '2026-11-02T08:00:00Z',
    };

    const messages: Message[] = [
      {
        id: 'msg-1',
        project_id: 'proj-1',
        task_id: 'task-42',
        sender_agent_id: 'orchestrator-1',
        recipient_agent_id: null,
        kind: 'info',
        body: 'Please make sure to check better-sqlite3 transaction isolation mode.',
        read_at: null,
        created_at: '2026-11-02T08:05:00Z',
      },
    ];

    const prompt = buildTaskPrompt({
      task,
      messages,
      role: 'backend',
      branch: 'agent/backend/task-42-fix-race-condition',
    });

    expect(prompt).toContain('# Task Assignment: [task-42] Fix Race Condition in Hub Claim');
    expect(prompt).toContain('**Role Required:** backend');
    expect(prompt).toContain('**Target Branch:** agent/backend/task-42-fix-race-condition');
    expect(prompt).toContain('## Acceptance Criteria\n- [ ] Enforce version equality');
    expect(prompt).toContain('better-sqlite3 transaction isolation mode');
    expect(prompt).toContain('AGENTS.md');
    expect(prompt).toContain('docs/SCHEMA.md');
    expect(prompt).toContain('NEVER merge to main');
    expect(prompt).toContain('Work STRICTLY within this worktree');
  });
});
