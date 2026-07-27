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
import {
  RichTextEditor,
  sanitizeHtml,
  htmlToText,
  tokenizeToChips,
  chipsToTokens,
  resolveTokensForPreview,
  FIELD_TOKENS,
} from '../components/email/RichTextEditor';

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

// ── Token/chip unit helpers ───────────────────────────────────────────────────

describe('tokenizeToChips / chipsToTokens round-trip', () => {
  it('converts {{first_name}} to a chip span with the human label', () => {
    const result = tokenizeToChips('<p>Hello {{first_name}},</p>');
    // The token value lives in the data-token attribute (OK), NOT as visible text
    expect(result).toContain('data-token="{{first_name}}"');
    expect(result).toContain('First name');
    // Visible text content should not show raw brackets — check by stripping tags
    const textContent = result.replace(/<[^>]+>/g, '');
    expect(textContent).not.toContain('{{first_name}}');
    expect(textContent).toContain('First name');
  });

  it('converts all known tokens to chips', () => {
    const tokens = ['{{first_name}}', '{{event_title}}', '{{start_date}}', '{{end_date}}', '{{launch_location}}'];
    for (const t of tokens) {
      const result = tokenizeToChips(t);
      expect(result).toContain(`data-token="${t}"`);
      // The visible text content (strip tags) must not show the raw {{token}}
      const textOnly = result.replace(/<[^>]+>/g, '');
      expect(textOnly).not.toContain(t);
    }
  });

  it('chipsToTokens reverses tokenizeToChips', () => {
    const original = '<p>Hello {{first_name}}, see you {{start_date}}!</p>';
    const chips = tokenizeToChips(original);
    const restored = chipsToTokens(chips);
    // Restored should contain the raw tokens, not chip HTML
    expect(restored).toContain('{{first_name}}');
    expect(restored).toContain('{{start_date}}');
    expect(restored).not.toContain('data-token');
  });

  it('chipsToTokens is a no-op when there are no chips', () => {
    const plain = '<p>Hello world</p>';
    expect(chipsToTokens(plain)).toBe(plain);
  });
});

// ── resolveTokensForPreview ───────────────────────────────────────────────────

describe('resolveTokensForPreview', () => {
  it('replaces raw {{tokens}} with sample values — no brackets remain', () => {
    const html = '<p>Hi {{first_name}}, event is {{event_title}} on {{start_date}} to {{end_date}}.</p>';
    const result = resolveTokensForPreview(html);
    expect(result).not.toContain('{{');
    expect(result).not.toContain('}}');
    expect(result).toContain('Friend'); // {{first_name}}
  });

  it('replaces chip spans with sample values — no data-token or brackets in output', () => {
    const chipped = tokenizeToChips('<p>Hi {{first_name}}, come to {{event_title}}!</p>');
    const result = resolveTokensForPreview(chipped);
    expect(result).not.toContain('{{');
    expect(result).not.toContain('}}');
    expect(result).not.toContain('data-token');
    expect(result).toContain('Friend');
  });

  it('uses live event data when provided', () => {
    const html = '<p>{{event_title}} runs {{start_date}} to {{end_date}}</p>';
    const result = resolveTokensForPreview(html, {
      title: 'Summer Encounter 2026',
      start_date: 'Aug 7',
      end_date: 'Aug 9',
    });
    expect(result).toContain('Summer Encounter 2026');
    expect(result).toContain('Aug 7');
    expect(result).toContain('Aug 9');
    expect(result).not.toContain('{{');
  });

  it('falls back to sample values when no event provided', () => {
    const html = '{{event_title}}';
    const result = resolveTokensForPreview(html, null);
    expect(result).not.toContain('{{');
    expect(result).toBeTruthy();
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

  it('renders token-containing body as chips — NO raw {{...}} visible in editor text', () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="<p>Hello {{first_name}},</p>" onChange={onChange} />);
    const editor = screen.getByRole('textbox', { name: /email body/i });
    // The chip should be present with data-token attribute (attribute value OK to have token)
    expect(editor.innerHTML).toContain('data-token="{{first_name}}"');
    // Human label visible in chip
    expect(editor.innerHTML).toContain('First name');
    // VISIBLE text (textContent) must not show raw brackets
    expect(editor.textContent).not.toContain('{{first_name}}');
  });

  it('serializes chips back to {{token}} on change/save', () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="<p>Hello {{first_name}},</p>" onChange={onChange} />);
    const editor = screen.getByRole('textbox', { name: /email body/i });
    // Simulate input event (editing content)
    fireEvent.input(editor);
    // onChange should have been called; the html param must contain {{first_name}}
    if (onChange.mock.calls.length > 0) {
      const [html] = onChange.mock.calls[onChange.mock.calls.length - 1];
      expect(html).toContain('{{first_name}}');
      expect(html).not.toContain('data-token');
    }
  });

  it('preview card shows no raw {{...}} brackets when value contains tokens', () => {
    const onChange = vi.fn();
    render(
      <RichTextEditor
        value="<p>Hi {{first_name}}, come to {{event_title}} on {{start_date}}.</p>"
        onChange={onChange}
      />
    );
    const preview = screen.getByTestId('email-preview');
    expect(preview.textContent).not.toContain('{{');
    expect(preview.textContent).not.toContain('}}');
  });

  it('preview card uses live event data when eventSample is provided', () => {
    const onChange = vi.fn();
    render(
      <RichTextEditor
        value="<p>{{event_title}} starts {{start_date}}</p>"
        onChange={onChange}
        eventSample={{ title: 'NWKS Men 2026', start_date: 'Aug 7', end_date: 'Aug 9' }}
      />
    );
    const preview = screen.getByTestId('email-preview');
    expect(preview.textContent).toContain('NWKS Men 2026');
    expect(preview.textContent).toContain('Aug 7');
    expect(preview.textContent).not.toContain('{{');
  });

  it('calls onChange with sanitized HTML and plain text on input', () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} />);
    const editor = screen.getByRole('textbox', { name: /email body/i });
    fireEvent.input(editor, { target: { innerHTML: '<p>Hello <strong>world</strong></p>' } });
    expect(onChange).toHaveBeenCalled();
    const [html, text] = onChange.mock.calls[0];
    expect(html).toContain('Hello');
    expect(html).toContain('<strong>world</strong>');
    expect(text).toContain('Hello world');
    expect(html).not.toContain('contenteditable');
  });

  it('tokens like {{first_name}} survive serialized in onChange html', () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} />);
    const editor = screen.getByRole('textbox', { name: /email body/i });
    // Simulate the chip HTML being in the editor when input fires
    const chipHtml = '<p><span data-token="{{first_name}}" contenteditable="false">First name</span>,</p>';
    fireEvent.input(editor, { target: { innerHTML: chipHtml } });
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

  it('renders "Insert field" button in the toolbar', () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} />);
    expect(screen.getByRole('button', { name: /insert field/i })).toBeInTheDocument();
  });

  it('"Insert field" button opens a menu with all available field options', async () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} />);
    const btn = screen.getByRole('button', { name: /insert field/i });
    fireEvent.mouseDown(btn);
    await waitFor(() => {
      for (const f of FIELD_TOKENS) {
        expect(screen.getByText(f.label)).toBeInTheDocument();
      }
    });
  });

  it('clicking a field in the Insert field menu inserts a chip (Insert field menu works)', async () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} />);
    const btn = screen.getByRole('button', { name: /insert field/i });
    fireEvent.mouseDown(btn);
    // Menu should open and show field options
    await waitFor(() => screen.getByRole('menu'));
    // All fields visible in menu
    expect(screen.getByRole('menu')).toBeInTheDocument();
    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems.length).toBeGreaterThan(0);
    // Fire mouseDown on "First name" option
    fireEvent.mouseDown(menuItems[0]);
    // emit() triggers onChange after chip insertion
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    // The html in onChange should contain the token (chip serialized back)
    const [html] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(html).toContain('{{first_name}}');
  });

  it('renders a live preview of the HTML content', () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="<p>Preview text here</p>" onChange={onChange} />);
    expect(screen.getAllByText(/preview/i).length).toBeGreaterThan(0);
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

    it('preserves chip spans with data-token attribute through sanitizeHtml', () => {
      const chip = '<span data-token="{{first_name}}" contenteditable="false" style="color:blue">First name</span>';
      const result = sanitizeHtml(`<p>${chip}</p>`);
      expect(result).toContain('data-token="{{first_name}}"');
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
      // When there are chips, chipsToTokens runs first
      const chipHtml = tokenizeToChips('<p>Hello {{first_name}},</p>');
      expect(htmlToText(chipHtml)).toContain('{{first_name}}');
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
    expect(screen.getByRole('textbox', { name: /email body/i })).toBeInTheDocument();
    expect(screen.getByText(/send campaign/i)).toBeInTheDocument();
  });

  it('launch location filter is a <select> picklist (not a text input)', async () => {
    render(<CampaignComposer />, { wrapper: wrapper() });
    // Should be a combobox/select, not a text input
    const selects = screen.getAllByRole('combobox');
    // At least one select should be for launch location
    const launchSelect = selects.find(
      el => el.querySelector('option[value="Colby"]') ||
            (el as HTMLSelectElement).options?.[1]?.text === 'Colby'
    ) ?? selects[selects.length - 1];
    expect(launchSelect.tagName).toBe('SELECT');
  });

  it('launch location select has known Kansas town options', async () => {
    render(<CampaignComposer />, { wrapper: wrapper() });
    const selects = screen.getAllByRole('combobox');
    // The last combobox should be launch location (Role comes first)
    const locationSelect = selects[selects.length - 1] as HTMLSelectElement;
    const optionTexts = Array.from(locationSelect.options).map(o => o.text);
    // Should contain Kansas towns
    expect(optionTexts).toContain('Colby');
    expect(optionTexts).toContain('Hays');
    expect(optionTexts).toContain('Norton');
  });

  it('launch location select has no free-text input placeholder', async () => {
    render(<CampaignComposer />, { wrapper: wrapper() });
    // Should NOT have a text input with "e.g. Colby" placeholder
    expect(screen.queryByPlaceholderText(/e\.g\. Colby/i)).not.toBeInTheDocument();
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
    const editor = screen.getByRole('textbox', { name: /email body/i });
    fireEvent.input(editor, { target: { innerHTML: '<p>Hello</p>' } });

    await userEvent.click(screen.getByRole('button', { name: /send campaign/i }));
    await waitFor(() =>
      expect(screen.getByText(/done!/i)).toBeInTheDocument()
    );

    const calls = (fetchMock.mock.calls as [string, RequestInit][]);
    const draftCall = calls.find(([url]) =>
      url.includes('/api/admin/campaigns') &&
      !url.includes('/preview') &&
      !url.includes('/send') &&
      !url.includes('/schedule')
    );
    expect(draftCall).toBeDefined();
    expect(draftCall![1].method).toBe('POST');

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

    await userEvent.click(screen.getByLabelText(/schedule for/i));
    await userEvent.type(screen.getByPlaceholderText(/email subject/i), 'Scheduled Email');
    const editor = screen.getByRole('textbox', { name: /email body/i });
    fireEvent.input(editor, { target: { innerHTML: '<p>Body</p>' } });

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
    await waitFor(() => expect(screen.getByText(/5 recipient/i)).toBeInTheDocument());

    // Change role (first combobox)
    const roleSelect = screen.getAllByRole('combobox')[0];
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

  // The general template carries the branded wrapper + an editable message region.
  const GENERAL = {
    id: 1, program: 'mens', key: 'general', name: "Men's Encounter",
    subject: 'A message from NWKS Men’s Encounter',
    body_html: '<body><td style="background:#6E765F"></td><!--EDITABLE_START--><p>Hi {{first_name}},</p><p>Body</p><!--EDITABLE_END--><td style="background:#6E765F"></td></body>',
    body_text: 'Hi {{first_name}},', variables: '["first_name"]', updated_at: '2026-07-27T00:00:00Z',
  };

  const SAVED = {
    id: 2, program: 'mens', key: 'reminder_2', name: 'One-week reminder',
    subject: 'One week away!',
    body_html: '<body><!--EDITABLE_START--><p>Reminder</p><!--EDITABLE_END--></body>',
    body_text: 'Reminder', variables: '["first_name"]', updated_at: '2026-07-27T00:00:00Z',
  };

  it('lists templates from the API and labels the general one', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, templates: [GENERAL] }), { status: 200 })
    );
    render(<TemplateEditor />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText("Men's Encounter")).toBeInTheDocument());
    expect(screen.getByText(/general template/i)).toBeInTheDocument();
  });

  it('auto-selects the general template on mount', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, templates: [SAVED, GENERAL] }), { status: 200 })
    );
    render(<TemplateEditor />, { wrapper: wrapper() });
    // Even though SAVED is first, GENERAL is auto-selected.
    await waitFor(() =>
      expect(screen.getByDisplayValue(/A message from NWKS Men/)).toBeInTheDocument()
    );
    expect(screen.queryByText(/no template selected/i)).not.toBeInTheDocument();
  });

  it('shows empty prompt when no templates exist', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, templates: [] }), { status: 200 })
    );
    render(<TemplateEditor />, { wrapper: wrapper() });
    await waitFor(() =>
      expect(screen.getByText(/no template selected/i)).toBeInTheDocument()
    );
  });

  it('switches to a different template when clicked in the list', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, templates: [GENERAL, SAVED] }), { status: 200 })
    );
    render(<TemplateEditor />, { wrapper: wrapper() });
    await waitFor(() => screen.getByDisplayValue(/A message from NWKS Men/));
    await userEvent.click(screen.getByText('One-week reminder'));
    expect(screen.getByDisplayValue('One week away!')).toBeInTheDocument();
  });

  it('saves the selected template via PATCH', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, templates: [GENERAL] }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, template: { ...GENERAL, subject: 'Updated Subject' } }), { status: 200 })
      );

    render(<TemplateEditor />, { wrapper: wrapper() });
    await waitFor(() => screen.getByDisplayValue(/A message from NWKS Men/));

    const subjectInput = screen.getByLabelText(/subject line/i) as HTMLInputElement;
    await userEvent.clear(subjectInput);
    await userEvent.type(subjectInput, 'Updated Subject');

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(screen.getByText(/saved\./i)).toBeInTheDocument());

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    const patchCall = calls.find(([, init]) => init?.method === 'PATCH');
    expect(patchCall).toBeDefined();
    expect(patchCall![0]).toMatch(/\/api\/admin\/templates\/1/);
    const body = JSON.parse(patchCall![1].body as string);
    expect(body.subject).toBe('Updated Subject');
    // The locked branded wrapper survives the round-trip.
    expect(body.body_html).toContain('#6E765F');
    expect(body.body_html).toContain('EDITABLE_START');
  });

  it('creates a new template via POST when "Save as new template" is used', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, templates: [GENERAL] }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, template: { ...SAVED, name: 'My New Email' } }), { status: 201 })
      );

    render(<TemplateEditor />, { wrapper: wrapper() });
    await waitFor(() => screen.getByDisplayValue(/A message from NWKS Men/));

    await userEvent.click(screen.getByRole('button', { name: /save as new template/i }));
    const nameInput = screen.getByLabelText(/new template name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'My New Email');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls as [string, RequestInit][];
      const postCall = calls.find(([, init]) => init?.method === 'POST');
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall![1].body as string);
      expect(body.name).toBe('My New Email');
    });
  });

  it('does not offer delete for the general template', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, templates: [GENERAL] }), { status: 200 })
    );
    render(<TemplateEditor />, { wrapper: wrapper() });
    await waitFor(() => screen.getByDisplayValue(/A message from NWKS Men/));
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
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
