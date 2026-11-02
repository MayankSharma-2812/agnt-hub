/**
 * @agent-hub/hub
 * Fastify coordination server and SQLite storage
 */

import { VERSION } from '@agent-hub/shared';

export const HUB_APP_NAME = 'agent-hub-server';

export function getHubStatus(): { name: string; status: string; version: string } {
  return {
    name: HUB_APP_NAME,
    status: 'ok',
    version: VERSION,
  };
}
