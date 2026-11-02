import { describe, it, expect, vi } from 'vitest';
import { HubClient, HubClientError } from '../client.js';
import { formatError, formatOutput } from '../tools.js';

describe('MCP Shim Tool Formatting & Guidance', () => {
  it('formats output with concise summary and compact JSON codeblock', () => {
    const res = formatOutput('Task found', { id: 'T-1', title: 'Test Task' });
    expect(res.content).toHaveLength(1);
    expect(res.content[0].type).toBe('text');
    expect(res.content[0].text).toContain('Task found');
    expect(res.content[0].text).toContain('```json');
    expect(res.content[0].text).toContain('"id": "T-1"');
  });

  it('translates lock conflict 409 into actionable guidance', () => {
    const lockConflictError = new HubClientError(
      409,
      'LOCK_CONFLICT',
      "Path 'src/**' overlaps an active lock held by another agent",
      'Locked by backend-agent for task T-12 until 2026-11-02T12:00:00Z. Pick another task or message the owner.',
      {
        conflict: {
          agent_name: 'backend-agent',
          task_id: 'T-12',
          expires_at: '2026-11-02T12:00:00Z',
        },
      },
    );

    const formatted = formatError(lockConflictError);
    expect(formatted.isError).toBe(true);
    expect(formatted.content[0].text).toContain('LOCK_CONFLICT');
    expect(formatted.content[0].text).toContain('Locked by backend-agent for task T-12 until 2026-11-02T12:00:00Z');
  });

  it('translates version conflict into re-fetch guidance', () => {
    const versionConflict = new HubClientError(
      409,
      'VERSION_CONFLICT',
      'Version mismatch',
      'The task was modified by another agent concurrently. Fetch the latest task version with hub_get_task and retry.',
    );

    const formatted = formatError(versionConflict);
    expect(formatted.isError).toBe(true);
    expect(formatted.content[0].text).toContain('The task was modified by another agent concurrently');
  });

  it('mock HubClient makes authorized request with correct headers', async () => {
    const client = new HubClient({
      hubUrl: 'http://test-hub.local',
      hubToken: 'secret_token_abc',
      hubAgentName: 'qa-agent',
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ status: 'ok' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const data = await client.request<{ status: string }>('/health');
    expect(data.status).toBe('ok');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-hub.local/health',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer secret_token_abc',
          'X-Agent-Name': 'qa-agent',
        },
      }),
    );

    vi.unstubAllGlobals();
  });
});
