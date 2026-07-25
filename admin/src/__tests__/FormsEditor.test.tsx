// admin/src/__tests__/FormsEditor.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

  it('renders fields in each column', async () => {
    mockFetchMap({ '/api/admin/form-fields': { status: 200, body: FIELDS_RESPONSE } });

    render(<FormsEditor />, { wrapper: wrapper() });

    await waitFor(() => {
      expect(screen.getByDisplayValue('First Name')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Role Preference')).toBeInTheDocument();
    });
  });

  it('shows empty state for a role with no fields', async () => {
    const emptyServer = { ok: true, fields: { attendee: [ATTENDEE_FIELD], server: [] } };
    mockFetchMap({ '/api/admin/form-fields': { status: 200, body: emptyServer } });

    render(<FormsEditor />, { wrapper: wrapper() });

    await waitFor(() => expect(screen.getByText('Server Form')).toBeInTheDocument());
    expect(screen.getByText(/no fields yet/i)).toBeInTheDocument();
  });

  it('PATCHes when label is changed and Save is clicked', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }))
      // PATCH
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      // refetch
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }));

    render(<FormsEditor />, { wrapper: wrapper() });

    await waitFor(() => expect(screen.getByDisplayValue('First Name')).toBeInTheDocument());

    const labelInput = screen.getByDisplayValue('First Name');
    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, 'Given Name');

    fireEvent.click(screen.getByRole('button', { name: /save first_name/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const [patchUrl, patchInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(patchUrl).toMatch(/\/api\/admin\/form-fields\/1/);
    expect(patchInit.method).toBe('PATCH');
    const patched = JSON.parse(patchInit.body as string);
    expect(patched.label).toBe('Given Name');
  });

  it('PATCHes when type is changed', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }));

    render(<FormsEditor />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByDisplayValue('First Name')).toBeInTheDocument());

    // Change the type select for the attendee field
    const typeSelect = screen.getByRole('combobox', { name: /type for first_name/i });
    await userEvent.selectOptions(typeSelect, 'textarea');

    fireEvent.click(screen.getByRole('button', { name: /save first_name/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [, patchInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const patched = JSON.parse(patchInit.body as string);
    expect(patched.type).toBe('textarea');
  });

  it('PATCHes when required toggle is changed', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }));

    render(<FormsEditor />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByDisplayValue('First Name')).toBeInTheDocument());

    const reqCheckbox = screen.getByRole('checkbox', { name: /required for first_name/i });
    fireEvent.click(reqCheckbox);

    fireEvent.click(screen.getByRole('button', { name: /save first_name/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [, patchInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const patched = JSON.parse(patchInit.body as string);
    expect(patched.required).toBe(0);
  });

  it('shows option chips for a dropdown field', async () => {
    mockFetchMap({ '/api/admin/form-fields': { status: 200, body: FIELDS_RESPONSE } });
    render(<FormsEditor />, { wrapper: wrapper() });

    await waitFor(() => expect(screen.getByText('Prayer')).toBeInTheDocument());
    expect(screen.getByText('Worship')).toBeInTheDocument();
  });

  it('POSTs a new field when Add Field form is submitted', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, field: { ...ATTENDEE_FIELD, id: 99, name: 'phone', label: 'Phone' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }));

    render(<FormsEditor />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText('Attendee Form')).toBeInTheDocument());

    const labelInput = screen.getByRole('textbox', { name: /new attendee field label/i });
    await userEvent.type(labelInput, 'Phone');

    // There are two "Add Field" buttons (one per column); target the attendee one via its form
    const addForm = screen.getByRole('form', { name: /add attendee field/i });
    fireEvent.click(addForm.querySelector('button[type="submit"]')!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [postUrl, postInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(postUrl).toMatch(/\/api\/admin\/form-fields(\?|$)/);
    expect(postInit.method).toBe('POST');
    const posted = JSON.parse(postInit.body as string);
    expect(posted.label).toBe('Phone');
    expect(posted.role).toBe('attendee');
  });

  it('opens a delete confirmation and DELETEs on confirm', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(FIELDS_RESPONSE), { status: 200 }));

    render(<FormsEditor />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByDisplayValue('First Name')).toBeInTheDocument());

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
    await waitFor(() => expect(screen.getByDisplayValue('First Name')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /delete first_name/i }));
    expect(screen.getByRole('dialog', { name: /confirm delete/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('POSTs reorder when move up is clicked', async () => {
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
    await waitFor(() => expect(screen.getByDisplayValue('Last Name')).toBeInTheDocument());

    // Move Last Name up (it's second, so move-up is enabled)
    fireEvent.click(screen.getByRole('button', { name: /move last_name up/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [reorderUrl, reorderInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(reorderUrl).toMatch(/\/api\/admin\/form-fields\/reorder/);
    expect(reorderInit.method).toBe('POST');
    const body = JSON.parse(reorderInit.body as string);
    expect(body.role).toBe('attendee');
    expect(body.ordered_ids).toEqual([3, 1]); // swapped
  });

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

  it('shows an email_confirm note for that field', async () => {
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
});
