// admin/src/__tests__/FormsEditor.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProgramContext } from '../App';
import FormsEditor from '../pages/FormsEditor';

// ── Helpers ────────────────────────────────────────────────────────────────────

type FetchStub = { status: number; body: unknown };

function mockFetchMap(map: Record<string, FetchStub>) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const stripped = url.split('?')[0];
    const match = map[stripped] ?? map['*'];
    if (!match) throw new Error(`Unmocked fetch: ${url}`);
    return new Response(JSON.stringify(match.body), {
      status: match.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

const ATTENDEE_FIELD = {
  id: 1,
  program: 'mens',
  role: 'attendee',
  name: 'first_name',
  label: 'First Name',
  type: 'text',
  options: null,
  required: 1,
  help: null,
  sort: 1,
  active: 1,
};

const SERVER_FIELD = {
  id: 2,
  program: 'mens',
  role: 'server',
  name: 'role_preference',
  label: 'Role Preference',
  type: 'dropdown',
  options: JSON.stringify(['Prayer', 'Worship']),
  required: 1,
  help: null,
  sort: 1,
  active: 1,
};

const FIELDS_RESPONSE = {
  ok: true,
  fields: {
    attendee: [ATTENDEE_FIELD],
    server: [SERVER_FIELD],
  },
};

function wrapper(program: 'mens' | 'women' = 'mens') {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <ProgramContext.Provider value={{ program, setProgram: vi.fn() }}>
        {children}
      </ProgramContext.Provider>
    </MemoryRouter>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('FormsEditor page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state then renders Attendee and Server columns', async () => {
    mockFetchMap({ '/api/admin/form-fields': { status: 200, body: FIELDS_RESPONSE } });

    render(<FormsEditor />, { wrapper: wrapper() });

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Attendee Form')).toBeInTheDocument();
      expect(screen.getByText('Server Form')).toBeInTheDocument();
    });
  });

  it('renders collapsed rows as "Question N" with a preview of the label', async () => {
    mockFetchMap({ '/api/admin/form-fields': { status: 200, body: FIELDS_RESPONSE } });

    render(<FormsEditor />, { wrapper: wrapper() });

    await waitFor(() => expect(screen.getByText('Attendee Form')).toBeInTheDocument());

    // Both columns each have "Question 1" (attendee row 1 and server row 1)
    // getAllByText handles multiple matches
    const q1Matches = screen.getAllByText('Question 1', { exact: false });
    expect(q1Matches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/First Name/, { exact: false })).toBeInTheDocument();

    // Collapsed row — the label INPUT is NOT yet rendered (row collapsed)
    expect(screen.queryByRole('textbox', { name: /label for first_name/i })).not.toBeInTheDocument();
  });

  it('expands a row when the header is clicked and shows editable label, type, required', async () => {
    mockFetchMap({ '/api/admin/form-fields': { status: 200, body: FIELDS_RESPONSE } });

    render(<FormsEditor />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getAllByText('Question 1').length).toBeGreaterThan(0));

    // Click the first expand button
    const expandBtns = screen.getAllByRole('button', { name: /question 1 expand/i });
    fireEvent.click(expandBtns[0]);

    // Now the label input should appear
    expect(screen.getByRole('textbox', { name: /label for first_name/i })).toBeInTheDocument();
    // Type select
    expect(screen.getByRole('combobox', { name: /type for first_name/i })).toBeInTheDocument();
    // Required checkbox
    expect(screen.getByRole('checkbox', { name: /required for first_name/i })).toBeInTheDocument();
    // NO help field
    expect(screen.queryByRole('textbox', { name: /help text for first_name/i })).not.toBeInTheDocument();
  });

  it('has NO per-field Save button', async () => {
    mockFetchMap({ '/api/admin/form-fields': { status: 200, body: FIELDS_RESPONSE } });

    render(<FormsEditor />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getAllByText('Question 1').length).toBeGreaterThan(0));

    // Expand row
    const expandBtns = screen.getAllByRole('button', { name: /question 1 expand/i });
    fireEvent.click(expandBtns[0]);

    // No Save button
    expect(screen.queryByRole('button', { name: /save first_name/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
  });

  it('auto-PATCHes (debounced) when label is changed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }));

    render(<FormsEditor />, { wrapper: wrapper() });

    // Advance past initial fetch (real async) — runAllTimersAsync flushes micro+macro queue
    await act(async () => { vi.advanceTimersByTime(100); });
    await waitFor(() => expect(screen.getAllByText('Question 1').length).toBeGreaterThan(0), { timeout: 3000 });

    // Expand
    const expandBtns = screen.getAllByRole('button', { name: /question 1 expand/i });
    fireEvent.click(expandBtns[0]);

    const labelInput = screen.getByRole('textbox', { name: /label for first_name/i });
    fireEvent.change(labelInput, { target: { value: 'Given Name' } });

    // Advance past debounce (600ms)
    await act(async () => { vi.advanceTimersByTime(700); });

    // Autosave no longer refetches — just the initial GET + the PATCH (no reload).
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 3000 });

    const [patchUrl, patchInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(patchUrl).toMatch(/\/api\/admin\/form-fields\/1/);
    expect(patchInit.method).toBe('PATCH');
    const patched = JSON.parse(patchInit.body as string);
    expect(patched.label).toBe('Given Name');

    vi.useRealTimers();
  });

  it('auto-PATCHes when type is changed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }));

    render(<FormsEditor />, { wrapper: wrapper() });
    await act(async () => { vi.advanceTimersByTime(100); });
    await waitFor(() => expect(screen.getAllByText('Question 1').length).toBeGreaterThan(0), { timeout: 3000 });

    const expandBtns = screen.getAllByRole('button', { name: /question 1 expand/i });
    fireEvent.click(expandBtns[0]);

    const typeSelect = screen.getByRole('combobox', { name: /type for first_name/i });
    fireEvent.change(typeSelect, { target: { value: 'textarea' } });

    await act(async () => { vi.advanceTimersByTime(700); });

    // Autosave no longer refetches — just the initial GET + the PATCH (no reload).
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 3000 });
    const [, patchInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const patched = JSON.parse(patchInit.body as string);
    expect(patched.type).toBe('textarea');

    vi.useRealTimers();
  });

  it('auto-PATCHes when required toggle is changed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }));

    render(<FormsEditor />, { wrapper: wrapper() });
    await act(async () => { vi.advanceTimersByTime(100); });
    await waitFor(() => expect(screen.getAllByText('Question 1').length).toBeGreaterThan(0), { timeout: 3000 });

    const expandBtns = screen.getAllByRole('button', { name: /question 1 expand/i });
    fireEvent.click(expandBtns[0]);

    const reqCheckbox = screen.getByRole('checkbox', { name: /required for first_name/i });
    fireEvent.click(reqCheckbox);

    await act(async () => { vi.advanceTimersByTime(700); });

    // Autosave no longer refetches — just the initial GET + the PATCH (no reload).
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 3000 });
    const [, patchInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const patched = JSON.parse(patchInit.body as string);
    expect(patched.required).toBe(0);

    vi.useRealTimers();
  });

  it('shows option chips for a dropdown field when expanded', async () => {
    mockFetchMap({ '/api/admin/form-fields': { status: 200, body: FIELDS_RESPONSE } });

    render(<FormsEditor />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getAllByText('Question 1').length).toBeGreaterThan(0));

    // Both columns have a "Question 1" — find Server column's expand button
    const expandBtns = screen.getAllByRole('button', { name: /question 1 expand/i });
    // Second one is the server column
    fireEvent.click(expandBtns[1]);

    expect(screen.getByText('Prayer')).toBeInTheDocument();
    expect(screen.getByText('Worship')).toBeInTheDocument();
  });

  it('shows empty state for a role with no fields', async () => {
    const emptyServer = { ok: true, fields: { attendee: [ATTENDEE_FIELD], server: [] } };
    mockFetchMap({ '/api/admin/form-fields': { status: 200, body: emptyServer } });

    render(<FormsEditor />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText('Server Form')).toBeInTheDocument());
    expect(screen.getByText(/no fields yet/i)).toBeInTheDocument();
  });

  it('POSTs a new field when "+ Add question" is clicked', async () => {
    const newField = { ...ATTENDEE_FIELD, id: 99, name: 'new_question_123', label: 'New question' };
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, field: newField }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }));

    render(<FormsEditor />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText('Attendee Form')).toBeInTheDocument());

    const addBtn = screen.getByRole('button', { name: /add attendee question/i });
    fireEvent.click(addBtn);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [postUrl, postInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(postUrl).toMatch(/\/api\/admin\/form-fields(\?|$)/);
    expect(postInit.method).toBe('POST');
    const posted = JSON.parse(postInit.body as string);
    expect(posted.role).toBe('attendee');
    expect(posted.label).toBe('New question');
  });

  it('opens a delete confirmation and DELETEs on confirm', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }));

    render(<FormsEditor />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getAllByText('Question 1').length).toBeGreaterThan(0));

    // Expand to see Delete button
    const expandBtns = screen.getAllByRole('button', { name: /question 1 expand/i });
    fireEvent.click(expandBtns[0]);

    fireEvent.click(screen.getByRole('button', { name: /delete first_name/i }));

    // Confirmation dialog should appear
    expect(screen.getByRole('dialog', { name: /confirm delete/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [deleteUrl, deleteInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(deleteUrl).toMatch(/\/api\/admin\/form-fields\/1/);
    expect(deleteInit.method).toBe('DELETE');
  });

  it('cancels delete when Cancel is clicked', async () => {
    mockFetchMap({ '/api/admin/form-fields': { status: 200, body: FIELDS_RESPONSE } });
    render(<FormsEditor />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getAllByText('Question 1').length).toBeGreaterThan(0));

    const expandBtns = screen.getAllByRole('button', { name: /question 1 expand/i });
    fireEvent.click(expandBtns[0]);

    fireEvent.click(screen.getByRole('button', { name: /delete first_name/i }));
    expect(screen.getByRole('dialog', { name: /confirm delete/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('POSTs reorder when drag ends with new order (keyboard reorder)', async () => {
    const twoAttendeeFields = {
      ok: true,
      fields: {
        attendee: [
          ATTENDEE_FIELD,
          { ...ATTENDEE_FIELD, id: 3, name: 'last_name', label: 'Last Name', sort: 2 },
        ],
        server: [],
      },
    };

    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(twoAttendeeFields), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(twoAttendeeFields), { status: 200 }));

    render(<FormsEditor />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText('Question 2')).toBeInTheDocument(), { timeout: 5000 });

    // Use keyboard drag: focus the second drag handle, Space to pick up, ArrowUp to move, Space to drop
    // dnd-kit keyboard sensor: requires tab-focusable button with role="button"
    const dragHandles = screen.getAllByRole('button', { name: /drag handle/i });
    // dragHandles[0] = first row handle, dragHandles[1] = second row handle (move it up)
    dragHandles[1].focus();
    await act(async () => {
      fireEvent.keyDown(dragHandles[1], { key: ' ', code: 'Space', keyCode: 32 });
    });
    await act(async () => {
      fireEvent.keyDown(dragHandles[1], { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 });
    });
    await act(async () => {
      fireEvent.keyDown(dragHandles[1], { key: ' ', code: 'Space', keyCode: 32 });
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 8000 });
    const [reorderUrl, reorderInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(reorderUrl).toMatch(/\/api\/admin\/form-fields\/reorder/);
    expect(reorderInit.method).toBe('POST');
    const body = JSON.parse(reorderInit.body as string);
    expect(body.role).toBe('attendee');
    expect(body.ordered_ids).toEqual([3, 1]); // swapped
  }, 10000);

  it('refetches when program context changes', async () => {
    const fetchMock = mockFetchMap({
      '/api/admin/form-fields': { status: 200, body: FIELDS_RESPONSE },
    });

    const { rerender } = render(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
          <FormsEditor />
        </ProgramContext.Provider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'women', setProgram: vi.fn() }}>
          <FormsEditor />
        </ProgramContext.Provider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('shows an email_confirm note for that field when expanded', async () => {
    const withEmailConfirm = {
      ok: true,
      fields: {
        attendee: [
          { ...ATTENDEE_FIELD, id: 5, name: 'email_confirm', label: 'Confirm Email', type: 'email' },
        ],
        server: [],
      },
    };
    mockFetchMap({ '/api/admin/form-fields': { status: 200, body: withEmailConfirm } });
    render(<FormsEditor />, { wrapper: wrapper('women') });

    await waitFor(() => expect(screen.getByText('Question 1')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /question 1 expand/i }));

    await waitFor(() =>
      expect(screen.getByText(/client-side confirmation field/i)).toBeInTheDocument()
    );
  });

  it('shows an error alert when API fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'DB error' }), { status: 500 }),
    );
    render(<FormsEditor />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument()
    );
  });

  it('does not render a help text input anywhere', async () => {
    mockFetchMap({ '/api/admin/form-fields': { status: 200, body: FIELDS_RESPONSE } });
    render(<FormsEditor />, { wrapper: wrapper() });

    await waitFor(() => expect(screen.getByText('Attendee Form')).toBeInTheDocument());

    // Expand both rows
    const expandBtns = screen.getAllByRole('button', { name: /question 1 expand/i });
    expandBtns.forEach((btn) => fireEvent.click(btn));

    // No help text input anywhere
    expect(screen.queryByRole('textbox', { name: /help/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/help text/i)).not.toBeInTheDocument();
  });
});
