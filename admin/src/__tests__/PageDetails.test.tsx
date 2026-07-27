// admin/src/__tests__/PageDetails.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProgramContext } from '../App';
import PageDetails from '../pages/PageDetails';

// ── Fixture: the page document ───────────────────────────────────────────────
const DOC = {
  eventName: "NWKS Men's Encounter",
  dates: 'August 6 - 8, 2026',
  tagline: 'It is for freedom that Christ has set us free.',
  logo: 'men-logo-300x300-1.jpg',
  sections: [
    { id: 'what-is', title: "What is Men's Encounter?", blocks: ['A paragraph here.'] },
  ],
  cost: '$125',
  bring: ['Sleeping bag', 'Pillow(s)'],
  contacts: [{ name: 'Norton - Lucas', phone: '785-202-0302' }],
  register: [{ label: 'Register as an Attendee', href: 'https://example.com' }],
  verse: 'Galatians 5:1',
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

/** Mock fetch: GET page-document → doc; PUT → updated_at (and record the body). */
function mockPageDoc() {
  const puts: Array<{ url: string; body: any }> = [];
  const spy = vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.includes('/page-document') && method === 'PUT') {
      puts.push({ url, body: JSON.parse(init!.body as string) });
      return new Response(JSON.stringify({ ok: true, updated_at: '2026-07-27T12:00:00Z' }), { status: 200 });
    }
    if (url.includes('/page-document')) {
      return new Response(JSON.stringify({ ok: true, doc: DOC }), { status: 200 });
    }
    throw new Error(`Unmocked fetch: ${url}`);
  });
  return { spy, puts };
}

describe('PageDetails inline editor', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders the page content from the document', async () => {
    mockPageDoc();
    render(<PageDetails />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByLabelText('Event name')).toBeInTheDocument());
    expect(screen.getByLabelText('Event name')).toHaveValue("NWKS Men's Encounter");
    expect(screen.getByDisplayValue('Sleeping bag')).toBeInTheDocument();
    expect(screen.getByDisplayValue("What is Men's Encounter?")).toBeInTheDocument();
  });

  it('has a Publish button (not a Register button), disabled until edited', async () => {
    mockPageDoc();
    render(<PageDetails />, { wrapper: wrapper() });
    await waitFor(() => screen.getByTestId('publish-btn'));
    expect(screen.getByRole('button', { name: /publish/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /register as an attendee/i })).not.toBeInTheDocument();
  });

  it('editing text enables Publish and PUTs the document', async () => {
    const { puts } = mockPageDoc();
    render(<PageDetails />, { wrapper: wrapper() });
    await waitFor(() => screen.getByLabelText('Event name'));

    fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'NWKS Mens Encounter (edited)' } });
    const publish = screen.getByTestId('publish-btn');
    expect(publish).not.toBeDisabled();

    fireEvent.click(publish);
    await waitFor(() => expect(puts.length).toBe(1));
    expect(puts[0].body.doc.eventName).toBe('NWKS Mens Encounter (edited)');
    await waitFor(() => expect(screen.getByText(/published/i)).toBeInTheDocument());
  });

  it('pressing Enter in a "What to Bring" item adds a new bulleted item', async () => {
    mockPageDoc();
    render(<PageDetails />, { wrapper: wrapper() });
    await waitFor(() => screen.getByDisplayValue('Sleeping bag'));

    const before = screen.getAllByLabelText(/^List item/i).length;
    const first = screen.getByDisplayValue('Sleeping bag');
    fireEvent.keyDown(first, { key: 'Enter', code: 'Enter' });

    await waitFor(() =>
      expect(screen.getAllByLabelText(/^List item/i).length).toBe(before + 1)
    );
  });

  it('adds a new list item via the + Add item button too', async () => {
    mockPageDoc();
    render(<PageDetails />, { wrapper: wrapper() });
    await waitFor(() => screen.getByDisplayValue('Sleeping bag'));
    const before = screen.getAllByLabelText(/^List item/i).length;
    fireEvent.click(screen.getAllByRole('button', { name: /add item/i })[0]);
    await waitFor(() =>
      expect(screen.getAllByLabelText(/^List item/i).length).toBe(before + 1)
    );
  });
});
