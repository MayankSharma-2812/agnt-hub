/**
 * @agent-hub/daemon (hubd)
 * CLI and daemon watching hub tasks and running headless agy
 */

import { VERSION } from '@agent-hub/shared';

export const DAEMON_NAME = 'hubd';

export function getDaemonVersion(): string {
  return `${DAEMON_NAME} v${VERSION}`;
}
