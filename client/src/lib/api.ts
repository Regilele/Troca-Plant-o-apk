export class ApiError extends Error {
  code: string;
  status: number;
  warnings: string[];
  details: unknown;

  constructor(message: string, options: { code?: string; status?: number; warnings?: string[]; details?: unknown } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = options.code || 'error';
    this.status = options.status || 0;
    this.warnings = options.warnings || [];
    this.details = options.details ?? null;
  }
}

const TOKEN_KEY = 'rgsa.session';

/**
 * Cópia em memória: em iframes restritos e no modo privado o localStorage
 * pode lançar exceção, mas a sessão ainda precisa valer nesta aba.
 */
let memoryToken: string | null = null;

/** Token de sessão persistido no aparelho (funciona sem cookies). */
export function getSessionToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

export function setSessionToken(token: string | null) {
  memoryToken = token;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage indisponível: a sessão vale só nesta aba */
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-requested-with': 'rgsa-plantao' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const token = getSessionToken();
  if (token) headers.authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method || 'GET',
      headers,
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError('Sem conexão com o servidor. Verifique sua internet — nada foi perdido.', { code: 'offline' });
  }

  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const err = payload?.error || {};
    throw new ApiError(err.message || `Falha na requisição (${response.status}).`, {
      code: err.code,
      status: response.status,
      warnings: err.warnings || [],
      details: err,
    });
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
