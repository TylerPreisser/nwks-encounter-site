import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProgramContext } from '../App';
import { RecipientPreview } from '../components/email/RecipientPreview';
import { CampaignComposer } from '../components/email/CampaignComposer';
import { CampaignHistory } from '../components/email/CampaignHistory';
import { TemplateEditor } from '../components/email/TemplateEditor';
import { RichTextEditor, sanitizeHtml, htmlToText } from '../components/email/RichTextEditor';

// ── helpers ──────────────────────────────────────────────────────────────────

function wrapper(program: 'mens' | 'women' = 'mens') {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <ProgramContext.Provider value={{ program, setProgram: vi.fn() }}>
        {children}
      </ProgramContext.Provider>
    </MemoryRouter>
  );
}

// ── RecipientPreview ──────────────────────────────────────────────────────────

describe('RecipientPreview', () => {
  it('shows recipient count and sample names', () => {
    render(
      <RecipientPreview
        count={3}
        sample={[
          { first_name: 'John', last_name: 'Doe', email: 'john@x.com' },
          { first_name: 'Jane', last_name: 'Smith', email: 'jane@x.com' },
        ]}
        loading={false}
      />
    );
    expect(screen.getByText(/3 recipients/i)).toBeInTheDocument();
    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<RecipientPreview count={0} sample={[]} loading={true} />);
    expect(screen.getByText(/loading preview/i)).toBeInTheDocument();
  });

  it('shows empty state when count is 0', () => {
    render(<RecipientPreview count={0} sample={[]} loading={false} />);
    expect(screen.getByText(/no recipients match/i)).toBeInTheDocument();
  });

  it('shows overflow message when count exceeds sample length', () => {
    render(
      <RecipientPreview
        count={10}
        sample={[{ first_name: 'A', last_name: 'B', email: 'a@b.com' }]}
        loading={false}
      />
    );
    expect(screen.getByText(/and 9 more/i)).toBeInTheDocument();
  });

  it('shows singular "recipient" for count of 1', () => {
    render(
      <RecipientPreview
        count={1}
        sample={[{ first_name: 'Solo', last_name: 'User', email: 'solo@x.com' }]}
        loading={false}
      />
    );
    expect(screen.getByText(/1 recipient match/i)).toBeInTheDocument();
    expect(screen.queryByText(/recipients/i)).not.toBeInTheDocument();
  });
});

// ── RichTextEditor ────────────────────────────────────────────────────────────

describe('RichTextEditor', () => {
  it('renders with role=textbox and label', () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} label="Email body" />);
    expect(screen.getByRole('textbox', { name: /email body/i })).toBeInTheDocument();
  });

  it('renders initial HTML value', () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="<p>Hello world</p>" onChange={onChange} />);
    const editor = screen.getByRole('textbox', { name: /email body/i });
    expect(editor.innerHTML).toContain('Hello world');
  });

  it('calls onChange with sanitized HTML and plain text on input', () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} />);
    const editor = screen.getByRole('textbox', { name: /email body/i });
    // Simulate typing by mutating innerHTML and firing input event
    fireEvent.input(editor, { target: { innerHTML: '<p>Hello <strong>world</strong></p>' } });
    expect(onChange).toHaveBeenCalled();
    const [html, text] = onChange.mock.calls[0];
    expect(html).toContain('Hello');
    expect(html).toContain('<strong>world</strong>');
    expect(text).toContain('Hello world');
    // Should not contain raw contenteditable attribute in saved HTML
    expect(html).not.toContain('contenteditable');
  });

  it('tokens like {{first_name}} survive as plain text', () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} />);
    const editor = screen.getByRole('textbox', { name: /email body/i });
    fireEvent.input(editor, { target: { innerHTML: '<p>Hello {{first_name}},</p>' } });
    const [html] = onChange.mock.calls[0];
    expect(html).toContain('{{first_name}}');
  });

  it('shows toolbar buttons for bold, italic, H2, lists, link, clear', () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} />);
    expect(screen.getByTitle(/bold/i)).toBeInTheDocument();
    expect(screen.getByTitle(/italic/i)).toBeInTheDocument();
    expect(screen.getByTitle(/heading/i)).toBeInTheDocument();
    expect(screen.getByTitle(/bullet list/i)).toBeInTheDocument();
    expect(screen.getByTitle(/numbered list/i)).toBeInTheDocument();
    expect(screen.getByTitle(/insert link/i)).toBeInTheDocument();
    expect(screen.getByTitle(/clear formatting/i)).toBeInTheDocument();
  });

  it('renders a live preview of the HTML content', () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="<p>Preview text here</p>" onChange={onChange} />);
    // "Preview" label appears in the preview section header
    expect(screen.getAllByText(/preview/i).length).toBeGreaterThan(0);
    // "Preview text here" appears at least once (editor + preview card both show it)
    expect(screen.getAllByText('Preview text here').length).toBeGreaterThan(0);
  });

  describe('sanitizeHtml', () => {
    it('keeps semantic tags: p, strong, em, h2, ul, ol, li, a', () => {
      const input = '<p>Hello <strong>world</strong> and <em>italic</em></p>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('converts b/i to strong/em', () => {
      expect(sanitizeHtml('<p><b>bold</b> <i>italic</i></p>')).toBe('<p><strong>bold</strong> <em>italic</em></p>');
    });

    it('strips unknown/unsafe tags leaving text content', () => {
      const result = sanitizeHtml('<p>Hello <script>alert(1)</script> world</p>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('Hello');
    });

    it('strips contenteditable from tags', () => {
      const result = sanitizeHtml('<p contenteditable="true">Text</p>');
      expect(result).not.toContain('contenteditable');
      expect(result).toContain('<p>Text</p>');
    });

    it('emits clean output for a full email body', () => {
      const input = '<h2>Welcome</h2><p>Hello <strong>{{first_name}}</strong>,</p><ul><li>Item one</li><li>Item two</li></ul>';
      const result = sanitizeHtml(input);
      expect(result).toContain('<h2>Welcome</h2>');
      expect(result).toContain('{{first_name}}');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Item one</li>');
    });
  });

  describe('htmlToText', () => {
    it('strips all tags to readable text', () => {
      expect(htmlToText('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
    });

    it('preserves tokens in plain text', () => {
      expect(htmlToText('<p>Hello {{first_name}},</p>')).toBe('Hello {{first_name}},');
    });

    it('converts block tags to newlines', () => {
      const text = htmlToText('<p>Line one</p><p>Line two</p>');
      expect(text).toContain('Line one');
      expect(text).toContain('Line two');
    });
  });
});

// ── CampaignComposer ──────────────────────────────────────────────────────────

describe('CampaignComposer', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true, recipient_count: 0, sample: [] }), { status: 200 })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders subject input, rich-text editor and send button', async () => {
    render(<CampaignComposer />, { wrapper: wrapper() });
    expect(screen.getByPlaceholderText(/email subject/i)).toBeInTheDocument();
    // The rich-text editor is a contentEditable div with role="textbox"
    expect(screen.getByRole('textbox', { name: /email body/i })).toBeInTheDocument();
    expect(screen.getByText(/send campaign/i)).toBeInTheDocument();
  });

  it('calls preview endpoint on mount and shows recipient count', async () => {
    vi.restoreAllMocks();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, recipient_count: 7, sample: [] }), { status: 200 })
    );
    render(<CampaignComposer />, { wrapper: wrapper() });
    await waitFor(() =>
      expect(screen.getByText(/7 recipient/i)).toBeInTheDocument()
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/campaigns/preview'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('shows schedule datetime input when schedule mode is selected', async () => {
    render(<CampaignComposer />, { wrapper: wrapper() });
    const schedRadio = screen.getByLabelText(/schedule for/i);
    await userEvent.click(schedRadio);
    expect(screen.getByLabelText(/schedule date and time/i)).toBeInTheDocument();
  });

  it('shows Done! after a successful send', async () => {
    vi.restoreAllMocks();
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/preview')) {
        return new Response(JSON.stringify({ ok: true, recipient_count: 2, sample: [] }), { status: 200 });
      }
      if (url.includes('/send')) {
        return new Response(JSON.stringify({ ok: true, sent: 2 }), { status: 200 });
      }
      if (url.includes('/campaigns')) {
        return new Response(JSON.stringify({ ok: true, campaign: { id: 1 } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 400 });
    });

    render(<CampaignComposer />, { wrapper: wrapper() });

    await userEvent.type(screen.getByPlaceholderText(/email subject/i), 'Test Subject');
    // Type into the rich-text editor (contentEditable div with role="textbox")
    const editor = screen.getByRole('textbox', { name: /email body/i });
    fireEvent.input(editor, { target: { innerHTML: '<p>Hello</p>' } });

    await userEvent.click(screen.getByRole('button', { name: /send campaign/i }));
    await waitFor(() =>
      expect(screen.getByText(/done!/i)).toBeInTheDocument()
    );

    // Verify that draft POST was called
    const calls = (fetchMock.mock.calls as [string, RequestInit][]);
    const draftCall = calls.find(([url]) =>
      url.includes('/api/admin/campaigns') &&
      !url.includes('/preview') &&
      !url.includes('/send') &&
      !url.includes('/schedule')
    );
    expect(draftCall).toBeDefined();
    expect(draftCall![1].method).toBe('POST');

    // Verify that send POST was called
    const sendCall = calls.find(([url]) => url.includes('/send'));
    expect(sendCall).toBeDefined();
    expect(sendCall![1].method).toBe('POST');
  });

  it('calls schedule endpoint when schedule mode is used', async () => {
    vi.restoreAllMocks();
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/preview')) {
        return new Response(JSON.stringify({ ok: true, recipient_count: 1, sample: [] }), { status: 200 });
      }
      if (url.includes('/schedule')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.includes('/campaigns')) {
        return new Response(JSON.stringify({ ok: true, campaign: { id: 5 } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 400 });
    });

    render(<CampaignComposer />, { wrapper: wrapper() });

    // Switch to schedule mode
    await userEvent.click(screen.getByLabelText(/schedule for/i));
    // Fill required fields
    await userEvent.type(screen.getByPlaceholderText(/email subject/i), 'Scheduled Email');
    // Type into the rich-text editor
    const editor = screen.getByRole('textbox', { name: /email body/i });
    fireEvent.input(editor, { target: { innerHTML: '<p>Body</p>' } });

    // Set a datetime
    const dtInput = screen.getByLabelText(/schedule date and time/i);
    await userEvent.type(dtInput, '2030-01-01T10:00');

    await userEvent.click(screen.getByRole('button', { name: /schedule campaign/i }));
    await waitFor(() =>
      expect(screen.getByText(/done!/i)).toBeInTheDocument()
    );

    const calls = (fetchMock.mock.calls as [string, RequestInit][]);
    const schedCall = calls.find(([url]) => url.includes('/schedule'));
    expect(schedCall).toBeDefined();
    expect(schedCall![1].method).toBe('POST');
    const body = JSON.parse(schedCall![1].body as string);
    expect(body.scheduled_for).toBeDefined();
  });

  it('shows validation error when required fields are missing', async () => {
    render(<CampaignComposer />, { wrapper: wrapper() });
    await userEvent.click(screen.getByRole('button', { name: /send campaign/i }));
    expect(screen.getByText(/required/i)).toBeInTheDocument();
  });

  it('live preview count updates when segment changes', async () => {
    vi.restoreAllMocks();
    let callCount = 0;
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      callCount++;
      const count = callCount === 1 ? 5 : 12;
      return new Response(JSON.stringify({ ok: true, recipient_count: count, sample: [] }), { status: 200 });
    });

    render(<CampaignComposer />, { wrapper: wrapper() });
    // Wait for initial preview
    await waitFor(() => expect(screen.getByText(/5 recipient/i)).toBeInTheDocument());

    // Change segment (role) — triggers debounced refetch
    const roleSelect = screen.getByRole('combobox');
    await userEvent.selectOptions(roleSelect, 'attendee');

    await waitFor(() =>
      expect(screen.getByText(/12 recipient/i)).toBeInTheDocument()
    );
  });
});

// ── CampaignHistory ───────────────────────────────────────────────────────────

describe('CampaignHistory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows empty state when no campaigns', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, campaigns: [] }), { status: 200 })
    );
    render(<CampaignHistory refresh={0} />, { wrapper: wrapper() });
    await waitFor(() =>
      expect(screen.getByText(/no campaigns yet/i)).toBeInTheDocument()
    );
  });

  it('renders campaign rows with status badge', async () => {
    const campaigns = [
      { id: 1, subject: 'Welcome Email', status: 'sent', recipient_count: 42, created_at: '2025-01-01T00:00:00Z', sent_at: '2025-01-02T10:00:00Z', scheduled_for: null },
      { id: 2, subject: 'Upcoming Event', status: 'scheduled', recipient_count: 20, created_at: '2025-02-01T00:00:00Z', sent_at: null, scheduled_for: '2025-03-01T09:00:00Z' },
      { id: 3, subject: 'Draft Campaign', status: 'draft', recipient_count: 0, created_at: '2025-02-05T00:00:00Z', sent_at: null, scheduled_for: null },
    ];
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, campaigns }), { status: 200 })
    );
    render(<CampaignHistory refresh={0} />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText('Welcome Email')).toBeInTheDocument());
    expect(screen.getByText('sent')).toBeInTheDocument();
    expect(screen.getByText('scheduled')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByText('Upcoming Event')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Draft Campaign')).toBeInTheDocument();
    // scheduled_for shows "Scheduled:" prefix
    expect(screen.getByText(/scheduled:/i)).toBeInTheDocument();
  });

  it('refetches when program changes', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true, campaigns: [] }), { status: 200 })
    );

    const { rerender } = render(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
          <CampaignHistory refresh={0} />
        </ProgramContext.Provider>
      </MemoryRouter>
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'women', setProgram: vi.fn() }}>
          <CampaignHistory refresh={0} />
        </ProgramContext.Provider>
      </MemoryRouter>
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((fetchMock.mock.calls[1] as [string])[0]).toContain('program=women');
  });

  it('refetches when refresh prop increments', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true, campaigns: [] }), { status: 200 })
    );

    const { rerender } = render(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
          <CampaignHistory refresh={0} />
        </ProgramContext.Provider>
      </MemoryRouter>
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
          <CampaignHistory refresh={1} />
        </ProgramContext.Provider>
      </MemoryRouter>
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

// ── TemplateEditor ────────────────────────────────────────────────────────────

describe('TemplateEditor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const TEMPLATE = {
    id: 1, program: 'mens', key: 'welcome', name: 'Welcome Email',
    subject: 'Welcome to Encounter!', body_html: '<p>Hello</p>', body_text: 'Hello',
    variables: '[]', updated_at: '2025-01-01T00:00:00Z',
  };

  it('lists templates from the API', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, templates: [TEMPLATE] }), { status: 200 })
    );
    render(<TemplateEditor />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText('Welcome Email')).toBeInTheDocument());
    expect(screen.getByText(/mens · welcome/i)).toBeInTheDocument();
  });

  it('shows empty prompt when no template is selected', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, templates: [] }), { status: 200 })
    );
    render(<TemplateEditor />, { wrapper: wrapper() });
    await waitFor(() =>
      expect(screen.getByText(/select a template to edit/i)).toBeInTheDocument()
    );
  });

  it('populates form when template is clicked and saves via PATCH', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      // initial list
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, templates: [TEMPLATE] }), { status: 200 })
      )
      // PATCH save
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, template: { ...TEMPLATE, subject: 'Updated Subject' } }), { status: 200 })
      );

    render(<TemplateEditor />, { wrapper: wrapper() });
    await waitFor(() => screen.getByText('Welcome Email'));

    // Click template to select it
    await userEvent.click(screen.getByText('Welcome Email'));

    // Subject field should be populated
    const subjectInput = screen.getByDisplayValue('Welcome to Encounter!') as HTMLInputElement;
    expect(subjectInput).toBeInTheDocument();

    // Change subject
    await userEvent.clear(subjectInput);
    await userEvent.type(subjectInput, 'Updated Subject');

    // Save
    await userEvent.click(screen.getByRole('button', { name: /save template/i }));

    await waitFor(() => expect(screen.getByText(/saved\./i)).toBeInTheDocument());

    // Verify PATCH call
    const calls = fetchMock.mock.calls as [string, RequestInit][];
    const patchCall = calls.find(([url, init]) => init?.method === 'PATCH');
    expect(patchCall).toBeDefined();
    expect(patchCall![0]).toMatch(/\/api\/admin\/templates\/1/);
    const body = JSON.parse(patchCall![1].body as string);
    expect(body.subject).toBe('Updated Subject');
  });

  it('refetches templates when program changes', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true, templates: [] }), { status: 200 })
    );

    const { rerender } = render(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
          <TemplateEditor />
        </ProgramContext.Provider>
      </MemoryRouter>
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'women', setProgram: vi.fn() }}>
          <TemplateEditor />
        </ProgramContext.Provider>
      </MemoryRouter>
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((fetchMock.mock.calls[1] as [string])[0]).toContain('program=women');
  });
});
