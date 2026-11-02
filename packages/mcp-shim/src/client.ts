import { HubConfig } from './config.js';

export interface HubErrorDetails {
  code: string;
  message: string;
  conflict?: Record<string, unknown>;
  allowed?: string[];
  guidance?: string;
}

export class HubClientError extends Error {
  statusCode: number;
  code: string;
  guidance: string;
  details?: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, guidance: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'HubClientError';
    this.statusCode = statusCode;
    this.code = code;
    this.guidance = guidance;
    this.details = details;
  }
}

export class HubClient {
  private config: HubConfig;

  constructor(config: HubConfig) {
    this.config = config;
  }

  get agentName(): string {
    return this.config.hubAgentName;
  }

  async request<T>(path: string, options: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {}): Promise<T> {
    let url = `${this.config.hubUrl}${path.startsWith('/') ? path : '/' + path}`;

    if (options.query) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) {
          searchParams.append(key, value);
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.hubToken}`,
      'X-Agent-Name': this.config.hubAgentName,
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (err: unknown) {
      throw new HubClientError(
        0,
        'HUB_UNREACHABLE',
        `Failed to connect to Agent Hub at ${this.config.hubUrl}: ${(err as Error).message}`,
        'Check that the Agent Hub server is running and HUB_URL is reachable.',
      );
    }

    const text = await response.text();
    let data: Record<string, unknown>;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const errObj = (data.error as HubErrorDetails) || { code: 'HTTP_ERROR', message: text };
      const guidance = this.formatGuidance(response.status, errObj);
      throw new HubClientError(response.status, errObj.code || `HTTP_${response.status}`, errObj.message || 'Request failed', guidance, data);
    }

    return data as T;
  }

  private formatGuidance(status: number, error: HubErrorDetails): string {
    if (status === 409) {
      if (error.code === 'LOCK_CONFLICT' && error.conflict) {
        const c = error.conflict as { agent_name?: string; agent_id?: string; task_id?: string; expires_at?: string };
        const holder = c.agent_name || c.agent_id || 'another agent';
        const taskInfo = c.task_id ? ` for task ${c.task_id}` : '';
        const expiry = c.expires_at ? ` until ${c.expires_at}` : '';
        return `Locked by ${holder}${taskInfo}${expiry}. Pick another task or message the owner.`;
      }
      if (error.code === 'VERSION_CONFLICT') {
        return 'The task was modified by another agent concurrently. Fetch the latest task version with hub_get_task and retry.';
      }
      if (error.code === 'INVALID_TRANSITION') {
        const allowed = error.allowed?.join(', ') || 'none';
        return `Invalid transition. Allowed next states for this task are: [${allowed}].`;
      }
      if (error.code === 'CLAIM_RACE_LOST') {
        return 'Another agent claimed this task first. Run hub_list_tasks to select another ready task.';
      }
    }

    if (status === 401) {
      return 'The API token was rejected or revoked. Contact your admin or generate a new token.';
    }

    if (status === 403) {
      return 'Action forbidden. This operation requires administrator privileges.';
    }

    if (status === 404) {
      return 'The requested resource was not found. Check the ID parameter.';
    }

    if (status === 429) {
      return 'Rate limit exceeded (100 req/min). Wait a moment and back off before retrying.';
    }

    return 'Check parameters and retry, or inspect hub status with hub_whoami.';
  }
}
