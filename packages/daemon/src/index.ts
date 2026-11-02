/**
 * @agent-hub/daemon (hubd)
 * CLI and daemon watching hub tasks and running headless agy
 */

export * from './config.js';
export * from './client.js';
export * from './worktree.js';
export * from './prompt.js';
export * from './runner.js';
export * from './daemon.js';
export * from './doctor.js';

export const DAEMON_NAME = 'hubd';

export function getDaemonVersion(): string {
  return `${DAEMON_NAME} v0.1.0`;
}
