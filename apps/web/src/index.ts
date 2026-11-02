/**
 * @agent-hub/web
 * React web dashboard scaffold
 */

import { VERSION } from '@agent-hub/shared';

export const WEB_APP_NAME = 'agent-hub-web';

export function getWebInfo(): { name: string; version: string } {
  return {
    name: WEB_APP_NAME,
    version: VERSION,
  };
}
