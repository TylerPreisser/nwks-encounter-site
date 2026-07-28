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
  // Don't force application/json when body is FormData — let the browser set
  // the correct multipart/form-data boundary automatically.
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(url, {
    credentials: 'include',
    headers: isFormData
      ? { ...(init?.headers ?? {}) }
      : { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
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

export interface EncounterSummary {
  id: number;
  year: number;
  is_current: number;
}

/**
 * Lists the program's encounters (for the year switcher). Separate from apiFetch
 * so it can be mocked independently in tests without disturbing a page's own
 * apiFetch call sequence.
 */
export async function listEncounters(): Promise<EncounterSummary[]> {
  const d = await apiFetch<{ events: EncounterSummary[] }>('/admin/events');
  return d.events ?? [];
}

/* ── AI / Assistant API helpers ─────────────────────────────────────── */
export const ai = {
  createThread: (program: string, title?: string) =>
    fetch(`/api/admin/ai/threads?program=${program}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).then((r) => r.json()),

  getThread: (program: string, id: number) =>
    fetch(`/api/admin/ai/threads/${id}?program=${program}`).then((r) =>
      r.json(),
    ),

  listThreads: (program: string) =>
    fetch(`/api/admin/ai/threads?program=${program}`).then((r) => r.json()),

  sendMessage: (program: string, threadId: number, content: string) =>
    fetch(`/api/admin/ai/threads/${threadId}/message?program=${program}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }).then((r) => r.json()),

  listPending: (program: string) =>
    fetch(`/api/admin/ai/pending?program=${program}`).then((r) => r.json()),

  approvePending: (program: string, id: number) =>
    fetch(`/api/admin/ai/pending/${id}/approve?program=${program}`, {
      method: 'POST',
    }).then((r) => r.json()),

  rejectPending: (program: string, id: number) =>
    fetch(`/api/admin/ai/pending/${id}/reject?program=${program}`, {
      method: 'POST',
    }).then((r) => r.json()),
};
