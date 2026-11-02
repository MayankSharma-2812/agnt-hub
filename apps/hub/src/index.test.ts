import { describe, it, expect } from 'vitest';
import { getHubStatus, HUB_APP_NAME } from './index.js';

describe('hub app', () => {
  it('returns valid status structure', () => {
    const status = getHubStatus();
    expect(status.name).toBe(HUB_APP_NAME);
    expect(status.status).toBe('ok');
    expect(status.version).toBe('0.1.0');
  });
});
