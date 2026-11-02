import { Task, Message } from '@agent-hub/shared';

export interface PromptContext {
  task: Task;
  messages?: Message[];
  docsPaths?: string[];
  role: string;
  branch: string;
}

export function buildTaskPrompt(ctx: PromptContext): string {
  const { task, messages = [], docsPaths = [], role, branch } = ctx;

  const sections: string[] = [];

  // Header & Identity
  sections.push(
    `# Task Assignment: [${task.id}] ${task.title}`,
    `**Role Required:** ${role}`,
    `**Target Branch:** ${branch}`,
    `**Current Version:** ${task.version}`,
    `**Priority:** ${task.priority}`,
  );

  // Description
  if (task.description) {
    sections.push(`## Description\n${task.description}`);
  }

  // Acceptance Criteria
  if (task.acceptance_criteria) {
    sections.push(`## Acceptance Criteria\n${task.acceptance_criteria}`);
  }

  // Related Discussion / Messages
  if (messages.length > 0) {
    const formattedMessages = messages
      .map((m) => `- **[${m.kind.toUpperCase()}]** (${m.created_at || 'recent'}): ${m.body}`)
      .join('\n');
    sections.push(`## Discussion & Context\n${formattedMessages}`);
  }

  // Relevant Reference Docs
  const defaultDocs = [
    'AGENTS.md',
    'docs/PRD.md',
    'docs/TRD.md',
    'docs/SCHEMA.md',
    'docs/API.md',
    'docs/UIUX.md',
  ];
  const allDocs = Array.from(new Set([...defaultDocs, ...docsPaths]));
  sections.push(`## Reference Documentation\nRead these documents before proceeding:\n` +
    allDocs.map((doc) => `- ${doc}`).join('\n')
  );

  // Execution Rules & Constraints
  sections.push(
    `## Execution Rules (from AGENTS.md)`,
    `1. Work STRICTLY within this worktree. Never modify or touch files outside it.`,
    `2. Keep changes small, minimal, and focused on the acceptance criteria (Ponytail mode).`,
    `3. Always run the tests, linter, and typechecker before completing your work.`,
    `4. Commit all your changes cleanly to the current branch: ${branch}.`,
    `5. NEVER merge to main, never push directly to main, and never commit secrets or credentials.`,
  );

  return sections.join('\n\n');
}
