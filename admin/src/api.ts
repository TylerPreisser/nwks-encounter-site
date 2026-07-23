import type { Program } from './theme';

let _program: Program = 'mens';

export function setApiProgram(p: Program): void {
  _program = p;
}

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `/api${path}${sep}program=${_program}`;
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Raw fetch for non-JSON responses (e.g. CSV download). */
export async function apiFetchRaw(path: string, init?: RequestInit): Promise<Response> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `/api${path}${sep}program=${_program}`;
  return fetch(url, { credentials: 'include', ...init });
}
