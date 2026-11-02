import { describe, it, expect } from 'vitest';
import { TASK_STATUSES, AGENT_ROLES, VERSION } from './index.js';

describe('shared constants', () => {
  it('exports valid version string', () => {
    expect(VERSION).toBe('0.1.0');
  });

  it('defines 8 task statuses', () => {
    expect(TASK_STATUSES).toHaveLength(8);
    expect(TASK_STATUSES).toContain('ready');
    expect(TASK_STATUSES).toContain('in_progress');
  });

  it('defines 6 agent roles', () => {
    expect(AGENT_ROLES).toHaveLength(6);
    expect(AGENT_ROLES).toContain('orchestrator');
    expect(AGENT_ROLES).toContain('backend');
  });
});
