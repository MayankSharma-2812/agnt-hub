import { describe, it, expect } from 'vitest';
import { getDaemonVersion, DAEMON_NAME } from './index.js';

describe('daemon package', () => {
  it('returns valid daemon version string', () => {
    expect(getDaemonVersion()).toBe(`${DAEMON_NAME} v0.1.0`);
  });
});
