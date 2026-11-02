import { HubdConfig } from './config.js';
import {
  Task,
  TaskStatus,
  Run,
  RunStatus,
  Message,
  MessageKind,
  Artifact,
  ArtifactKind,
  Agent,
  AgentStatus,
  Member,
} from '@agent-hub/shared';

export interface TaskDetail {
  task: Task;
  dependencies: Task[];
  messages: Message[];
  artifacts: Artifact[];
  runs: Run[];
}

export class HubClient {
  constructor(private config: HubdConfig) {}

  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: unknown;
      query?: Record<string, string | undefined>;
    } = {},
  ): Promise<T> {
    let url = `${this.config.hubUrl.replace(/\/+$/, '')}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

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
      Authorization: `Bearer ${this.config.token}`,
      'X-Agent-Name': this.config.agentName,
      'X-Agent-Role': this.config.role,
    };

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      let errorBody: { error?: { code?: string; message?: string } } | undefined;
      try {
        errorBody = (await res.json()) as { error?: { code?: string; message?: string } };
      } catch {
        // non-JSON response
      }
      const code = errorBody?.error?.code || `HTTP_${res.status}`;
      const msg = errorBody?.error?.message || `Request failed with status ${res.status}`;
      const err = new Error(`[${code}] ${msg}`);
      (err as unknown as { status: number; code: string }).status = res.status;
      (err as unknown as { status: number; code: string }).code = code;
      throw err;
    }

    if (res.status === 204) {
      return {} as T;
    }

    return (await res.json()) as T;
  }

  async getHealth(): Promise<{ status: string }> {
    return this.request<{ status: string }>('/health');
  }

  async getMe(): Promise<{ member: Member; agent?: Agent }> {
    return this.request<{ member: Member; agent?: Agent }>('/api/v1/me');
  }

  async getAgents(): Promise<{ agents: Agent[] }> {
    return this.request<{ agents: Agent[] }>('/api/v1/agents');
  }

  async getTasks(query?: {
    status?: string;
    role_required?: string;
    assigned_to?: string;
  }): Promise<{ tasks: Task[] }> {
    return this.request<{ tasks: Task[] }>('/api/v1/tasks', { query });
  }

  async getTask(taskId: string): Promise<TaskDetail> {
    return this.request<TaskDetail>(`/api/v1/tasks/${taskId}`);
  }

  async claimTask(taskId: string, version: number): Promise<{ task: Task }> {
    return this.request<{ task: Task }>(`/api/v1/tasks/${taskId}/claim`, {
      method: 'POST',
      body: { version },
    });
  }

  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    options?: { branch?: string; pr_url?: string; note?: string },
  ): Promise<{ task: Task }> {
    return this.request<{ task: Task }>(`/api/v1/tasks/${taskId}/status`, {
      method: 'POST',
      body: { status, ...options },
    });
  }

  async createRun(payload: {
    task_id: string;
    status?: RunStatus;
    model?: string | null;
    log_path?: string | null;
    note?: string | null;
  }): Promise<{ run: Run }> {
    return this.request<{ run: Run }>('/api/v1/runs', {
      method: 'POST',
      body: payload,
    });
  }

  async updateRun(
    runId: string,
    payload: {
      status: RunStatus;
      exit_code?: number | null;
      note?: string | null;
    },
  ): Promise<{ run: Run }> {
    return this.request<{ run: Run }>(`/api/v1/runs/${runId}`, {
      method: 'PATCH',
      body: payload,
    });
  }

  async postMessage(payload: {
    project_id: string;
    task_id?: string;
    recipient_agent_id?: string;
    kind: MessageKind;
    body: string;
  }): Promise<{ message: Message }> {
    return this.request<{ message: Message }>('/api/v1/messages', {
      method: 'POST',
      body: payload,
    });
  }

  async postArtifact(payload: {
    task_id: string;
    kind: ArtifactKind;
    title: string;
    uri: string;
    summary?: string;
  }): Promise<{ artifact: Artifact }> {
    return this.request<{ artifact: Artifact }>('/api/v1/artifacts', {
      method: 'POST',
      body: payload,
    });
  }

  async heartbeat(payload?: {
    status?: AgentStatus;
    current_task_id?: string | null;
  }): Promise<{ agent: Agent }> {
    return this.request<{ agent: Agent }>('/api/v1/agents/heartbeat', {
      method: 'POST',
      body: { status: payload?.status || 'idle', current_task_id: payload?.current_task_id ?? null },
    });
  }
}
