import { useRef, useEffect, useCallback, useState } from 'react';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Strip all tags and collapse whitespace into readable plain text. */
export function htmlToText(html: string): string {
  // Convert block-end tags to newlines before stripping
  const withNewlines = html
    .replace(/<\/(p|h[1-6]|li|br|div|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  return withNewlines
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Sanitise raw innerHTML into email-safe semantic HTML.
 * Keeps: p, strong, em, h2, ul, ol, li, a, br.
 * Strips contenteditable attrs and all other tags → their text content.
 */
export function sanitizeHtml(raw: string): string {
  // Map divs/spans wrapping content → paragraphs only when meaningful
  let html = raw
    .replace(/<div>/gi, '<p>')
    .replace(/<\/div>/gi, '</p>')
    .replace(/<span[^>]*>/gi, '')
    .replace(/<\/span>/gi, '');

  // Remove contenteditable and other non-semantic attributes from kept tags
  const ALLOWED: Record<string, string[]> = {
    p: [],
    strong: [],
    b: [],
    em: [],
    i: [],
    h2: [],
    ul: [],
    ol: [],
    li: [],
    br: [],
    a: ['href'],
  };

  // Parse with a DOMParser substitute: walk through tags and allow/deny
  html = html.replace(/<(\/?)([\w-]+)([^>]*)>/gi, (match, slash, tag, attrs) => {
    const lower = tag.toLowerCase();
    if (!(lower in ALLOWED)) {
      // Unknown tag — drop it (keep its text content by removing only the tag)
      return '';
    }
    if (slash) return `</${lower}>`;

    // Closing or void tags for allowed set
    const allowedAttrs = ALLOWED[lower];
    if (allowedAttrs.length === 0) {
      if (lower === 'br') return '<br>';
      return `<${lower}>`;
    }

    // Build cleaned attributes
    const cleanAttrs = allowedAttrs
      .map(attr => {
        const m = attrs.match(new RegExp(`${attr}=["']([^"']*)["']`, 'i'));
        return m ? `${attr}="${m[1]}"` : null;
      })
      .filter(Boolean)
      .join(' ');

    return cleanAttrs ? `<${lower} ${cleanAttrs}>` : `<${lower}>`;
  });

  // Normalise b/i → strong/em
  html = html
    .replace(/<b>/gi, '<strong>')
    .replace(/<\/b>/gi, '</strong>')
    .replace(/<i>/gi, '<em>')
    .replace(/<\/i>/gi, '</em>');

  // Collapse empty tags and trim
  html = html
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/<p>\s*<br>\s*<\/p>/g, '')
    .trim();

  return html;
}

// ── toolbar button ────────────────────────────────────────────────────────────

interface ToolbarBtnProps {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolbarBtn({ title, active, onClick, children }: ToolbarBtnProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={e => {
        e.preventDefault(); // prevent editor losing focus
        onClick();
      }}
      className={`px-2 py-1 text-sm rounded transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700 font-semibold'
          : 'hover:bg-gray-100 text-gray-600'
      }`}
    >
      {children}
    </button>
  );
}

// ── token menu ────────────────────────────────────────────────────────────────

const TOKENS = [
  { label: 'First name', value: '{{first_name}}' },
  { label: 'Last name', value: '{{last_name}}' },
  { label: 'Event title', value: '{{event_title}}' },
  { label: 'Event date', value: '{{event_date}}' },
  { label: 'Event location', value: '{{event_location}}' },
  { label: 'Registration link', value: '{{registration_link}}' },
];

interface TokenMenuProps {
  onInsert: (token: string) => void;
}

function TokenMenu({ onInsert }: TokenMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <ToolbarBtn title="Insert field" onClick={() => setOpen(v => !v)}>
        {'{ }'}
      </ToolbarBtn>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded shadow-md min-w-max">
          {TOKENS.map(t => (
            <button
              key={t.value}
              type="button"
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 text-gray-700"
              onMouseDown={e => {
                e.preventDefault();
                onInsert(t.value);
                setOpen(false);
              }}
            >
              {t.label}
              <span className="ml-2 text-xs text-gray-400 font-mono">{t.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── RichTextEditor ────────────────────────────────────────────────────────────

export interface RichTextEditorProps {
  /** Initial HTML value. External changes reset the editor. */
  value: string;
  /** Called whenever the content changes. html is sanitised; text is plain. */
  onChange: (html: string, text: string) => void;
  placeholder?: string;
  /** aria-label for the editing area */
  label?: string;
}

export function RichTextEditor({ value, onChange, placeholder = 'Start typing…', label = 'Email body' }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastHtmlRef = useRef<string>('');
  // Track active format states for toolbar
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});

  // Initialise / reset when external value changes (e.g. switching templates)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== lastHtmlRef.current) {
      el.innerHTML = value;
      lastHtmlRef.current = value;
    }
  }, [value]);

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const raw = el.innerHTML;
    const html = sanitizeHtml(raw);
    const text = htmlToText(html);
    lastHtmlRef.current = html;
    onChange(html, text);
  }, [onChange]);

  const updateToolbarState = useCallback(() => {
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
    });
  }, []);

  function execCmd(cmd: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    emit();
    updateToolbarState();
  }

  function insertH2() {
    editorRef.current?.focus();
    document.execCommand('formatBlock', false, 'h2');
    emit();
  }

  function insertParagraph() {
    editorRef.current?.focus();
    document.execCommand('formatBlock', false, 'p');
    emit();
  }

  function insertLink() {
    const url = prompt('Enter URL:');
    if (url) execCmd('createLink', url);
  }

  function insertToken(token: string) {
    editorRef.current?.focus();
    document.execCommand('insertText', false, token);
    emit();
  }

  return (
    <div className="border border-gray-300 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
        <ToolbarBtn title="Bold (Ctrl+B)" active={activeFormats.bold} onClick={() => execCmd('bold')}>
          <strong>B</strong>
        </ToolbarBtn>
        <ToolbarBtn title="Italic (Ctrl+I)" active={activeFormats.italic} onClick={() => execCmd('italic')}>
          <em>I</em>
        </ToolbarBtn>
        <div className="w-px h-5 bg-gray-300 mx-0.5" />
        <ToolbarBtn title="Heading" onClick={insertH2}>
          H2
        </ToolbarBtn>
        <ToolbarBtn title="Paragraph" onClick={insertParagraph}>
          P
        </ToolbarBtn>
        <div className="w-px h-5 bg-gray-300 mx-0.5" />
        <ToolbarBtn title="Bullet list" onClick={() => execCmd('insertUnorderedList')}>
          UL
        </ToolbarBtn>
        <ToolbarBtn title="Numbered list" onClick={() => execCmd('insertOrderedList')}>
          OL
        </ToolbarBtn>
        <div className="w-px h-5 bg-gray-300 mx-0.5" />
        <ToolbarBtn title="Insert link" onClick={insertLink}>
          Link
        </ToolbarBtn>
        <ToolbarBtn title="Clear formatting" onClick={() => execCmd('removeFormat')}>
          Tx
        </ToolbarBtn>
        <div className="w-px h-5 bg-gray-300 mx-0.5" />
        <TokenMenu onInsert={insertToken} />
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        role="textbox"
        aria-label={label}
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className="min-h-[9rem] px-3 py-2.5 text-sm text-gray-800 outline-none overflow-y-auto
          [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-gray-400
          prose prose-sm max-w-none
          prose-h2:text-lg prose-h2:font-semibold
          prose-strong:font-semibold"
        onInput={emit}
        onKeyUp={updateToolbarState}
        onMouseUp={updateToolbarState}
      />

      {/* Email preview */}
      <div className="border-t border-gray-200 bg-gray-50 px-3 py-2">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Preview</p>
        <div
          className="text-sm text-gray-700 prose prose-sm max-w-none
            bg-white rounded border border-gray-100 px-4 py-3
            prose-h2:text-base prose-h2:font-semibold prose-h2:mt-2 prose-h2:mb-1
            prose-p:my-1 prose-ul:my-1 prose-ol:my-1"
          /* eslint-disable-next-line react/no-danger */
          dangerouslySetInnerHTML={{ __html: value || '<p class="text-gray-400 italic">Nothing to preview yet…</p>' }}
        />
      </div>
    </div>
  );
}
