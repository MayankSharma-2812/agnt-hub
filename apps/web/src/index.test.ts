import { describe, it, expect } from 'vitest';
import { getWebInfo, WEB_APP_NAME } from './index.js';

describe('web app', () => {
  it('returns valid web package info', () => {
    const info = getWebInfo();
    expect(info.name).toBe(WEB_APP_NAME);
    expect(info.version).toBe('0.1.0');
  });
});
