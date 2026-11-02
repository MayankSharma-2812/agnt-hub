import { z } from 'zod';

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

export const AGENT_STATUSES = ['offline', 'idle', 'working', 'blocked'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const MESSAGE_KINDS = [
  'info',
  'question',
  'answer',
  'handoff',
  'blocker',
  'review_request',
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const ARTIFACT_KINDS = [
  'plan',
  'diff',
  'test_report',
  'screenshot',
  'doc',
  'pr',
  'link',
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const RUN_STATUSES = [
  'running',
  'succeeded',
  'failed',
  'timeout',
  'rate_limited',
  'cancelled',
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

// Zod schemas
export const MemberSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  is_admin: z.number().int().min(0).max(1).default(0),
  created_at: z.string().optional(),
});
export type Member = z.infer<typeof MemberSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  repo_url: z.string().nullable().optional(),
  default_branch: z.string().default('main'),
  created_at: z.string().optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const AgentSchema = z.object({
  id: z.string(),
  member_id: z.string(),
  name: z.string().min(1),
  role: z.enum(AGENT_ROLES),
  status: z.enum(AGENT_STATUSES).default('offline'),
  current_task_id: z.string().nullable().optional(),
  last_seen_at: z.string().nullable().optional(),
  daily_run_cap: z.number().int().positive().default(20),
});
export type Agent = z.infer<typeof AgentSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  title: z.string().min(1),
  description: z.string().default(''),
  acceptance_criteria: z.string().default(''),
  role_required: z.enum(AGENT_ROLES).nullable().optional(),
  priority: z.number().int().min(1).max(3).default(2),
  status: z.enum(TASK_STATUSES).default('backlog'),
  assignee_agent_id: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  pr_url: z.string().nullable().optional(),
  created_by_member_id: z.string().nullable().optional(),
  version: z.number().int().default(1),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  claimed_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
});
export type Task = z.infer<typeof TaskSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  task_id: z.string().nullable().optional(),
  from_agent_id: z.string().nullable().optional(),
  from_member_id: z.string().nullable().optional(),
  to_agent_id: z.string().nullable().optional(),
  kind: z.enum(MESSAGE_KINDS),
  body: z.string().min(1),
  reply_to_id: z.string().nullable().optional(),
  created_at: z.string().optional(),
});
export type Message = z.infer<typeof MessageSchema>;

export const FileLockSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  agent_id: z.string(),
  task_id: z.string().nullable().optional(),
  path_glob: z.string().min(1),
  expires_at: z.string(),
  released_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
});
export type FileLock = z.infer<typeof FileLockSchema>;

export const ArtifactSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  agent_id: z.string().nullable().optional(),
  kind: z.enum(ARTIFACT_KINDS),
  title: z.string().min(1),
  uri: z.string().min(1),
  summary: z.string().nullable().optional(),
  created_at: z.string().optional(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const RunSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  agent_id: z.string(),
  status: z.enum(RUN_STATUSES),
  started_at: z.string().optional(),
  ended_at: z.string().nullable().optional(),
  exit_code: z.number().int().nullable().optional(),
  model: z.string().nullable().optional(),
  log_path: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});
export type Run = z.infer<typeof RunSchema>;

export const EventSchema = z.object({
  id: z.number().int().optional(),
  project_id: z.string().nullable().optional(),
  actor_agent_id: z.string().nullable().optional(),
  actor_member_id: z.string().nullable().optional(),
  type: z.string().min(1),
  payload: z.string(),
  created_at: z.string().optional(),
});
export type Event = z.infer<typeof EventSchema>;

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    allowed: z.array(z.string()).optional(),
    details: z.any().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
