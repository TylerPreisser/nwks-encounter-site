// admin/src/__tests__/PageDetails.test.tsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProgramContext } from '../App';
import PageDetails from '../pages/PageDetails';

const DOC = {
  eventName: "NWKS Men's Encounter",
  dates: 'August 6 - 8, 2026',
  tagline: 'It is for freedom that Christ has set us free.',
  logo: 'men-logo-300x300-1.jpg',
  sections: [{ id: 'what-is', title: "What is Men's Encounter?", blocks: ['A paragraph here.'] }],
  cost: '$125',
  bring: ['Sleeping bag', 'Pillow(s)'],
  contacts: [{ name: 'Norton - Lucas', phone: '785-202-0302' }],
  register: [{ label: 'Register as an Attendee', href: 'https://example.com' }],
  verse: 'Galatians 5:1',
};

function wrapper(program: 'mens' | 'women' = 'mens') {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <ProgramContext.Provider value={{ program, setProgram: vi.fn() }}>{children}</ProgramContext.Provider>
    </MemoryRouter>
  );
}

function mockPageDoc() {
  const puts: Array<{ body: any }> = [];
  vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.includes('/page-document') && method === 'PUT') {
      puts.push({ body: JSON.parse(init!.body as string) });
      return new Response(JSON.stringify({ ok: true, updated_at: '2026-07-27T12:00:00Z' }), { status: 200 });
    }
    if (url.includes('/page-document')) {
      return new Response(JSON.stringify({ ok: true, doc: DOC }), { status: 200 });
    }
    throw new Error(`Unmocked: ${url}`);
  });
  return { puts };
}

describe('PageDetails inline editor (contentEditable, real styling)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders the page content as editable text', async () => {
    mockPageDoc();
    render(<PageDetails />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByLabelText('Event name')).toBeInTheDocument());
    expect(screen.getByLabelText('Event name').textContent).toBe("NWKS Men's Encounter");
    expect(screen.getByLabelText('List item 1').textContent).toBe('Sleeping bag');
    expect(screen.getByLabelText('Section 1 title').textContent).toBe("What is Men's Encounter?");
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

    const title = screen.getByLabelText('Event name');
    title.textContent = 'Edited Name';
    fireEvent.input(title);

    const publish = screen.getByTestId('publish-btn');
    await waitFor(() => expect(publish).not.toBeDisabled());
    fireEvent.click(publish);
    await waitFor(() => expect(puts.length).toBe(1));
    expect(puts[0].body.doc.eventName).toBe('Edited Name');
  });

  it('pressing Enter in a "What to Bring" item adds a new bulleted item', async () => {
    mockPageDoc();
    render(<PageDetails />, { wrapper: wrapper() });
    await waitFor(() => screen.getByLabelText('List item 1'));
    const before = screen.getAllByLabelText(/^List item/i).length;
    fireEvent.keyDown(screen.getByLabelText('List item 1'), { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(screen.getAllByLabelText(/^List item/i).length).toBe(before + 1));
  });

  it('undo reverts a text edit', async () => {
    mockPageDoc();
    render(<PageDetails />, { wrapper: wrapper() });
    await waitFor(() => screen.getByLabelText('Event name'));
    const title = screen.getByLabelText('Event name');
    title.textContent = 'Changed name';
    fireEvent.input(title);
    await waitFor(() => expect(screen.getByTestId('undo-btn')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('undo-btn'));
    await waitFor(() => expect(screen.getByLabelText('Event name').textContent).toBe("NWKS Men's Encounter"));
  });

  it('renders with the real page classes (men theme)', async () => {
    mockPageDoc();
    render(<PageDetails />, { wrapper: wrapper() });
    await waitFor(() => screen.getByTestId('page-editor'));
    expect(screen.getByTestId('page-editor').className).toContain('pe-page--men');
  });
});
