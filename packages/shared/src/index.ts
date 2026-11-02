/**
 * @agent-hub/shared
 * Shared domain types, constants and validation schemas
 */

export const VERSION = '0.1.0';

export const TASK_STATUSES = [
  'backlog',
  'ready',
  'claimed',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const AGENT_ROLES = [
  'orchestrator',
  'backend',
  'frontend',
  'qa',
  'devops',
  'reviewer',
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];
