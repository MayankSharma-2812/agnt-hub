export interface StoredAuth {
  hubUrl: string;
  token: string;
  memberName?: string;
  isAdmin?: boolean;
}

const STORAGE_KEY = 'agent_hub_auth';

export function getStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveStoredAuth(auth: StoredAuth): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

export function clearStoredAuth(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  allowed?: string[];

  constructor(status: number, code: string, message: string, details?: unknown, allowed?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.allowed = allowed;
  }
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | undefined>;
    agentName?: string;
  } = {},
): Promise<T> {
  const auth = getStoredAuth();
  const baseUrl = auth?.hubUrl || (window.location.origin.includes('5173') ? 'http://localhost:3000' : window.location.origin);

  let url = `${baseUrl}${path.startsWith('/') ? path : '/' + path}`;

  if (options.query) {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(options.query)) {
      if (val !== undefined && val !== '') {
        searchParams.append(key, val);
      }
    }
    const qs = searchParams.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }

  const headers: Record<string, string> = {};
  if (auth?.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }
  if (options.agentName) {
    headers['X-Agent-Name'] = options.agentName;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    if (res.status === 401) {
      clearStoredAuth();
    }
    const errObj = (data.error as { code?: string; message?: string; allowed?: string[]; details?: unknown }) || {};
    throw new ApiError(
      res.status,
      errObj.code || `HTTP_${res.status}`,
      errObj.message || 'Request failed',
      errObj.details,
      errObj.allowed,
    );
  }

  return data as T;
}
