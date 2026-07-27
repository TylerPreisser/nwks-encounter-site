import { useRef, useEffect, useCallback, useState } from 'react';

// ── Token definitions ────────────────────────────────────────────────────────

export const FIELD_TOKENS: Array<{ label: string; token: string }> = [
  { label: 'First name',       token: '{{first_name}}' },
  { label: 'Event',            token: '{{event_title}}' },
  { label: 'Start date',       token: '{{start_date}}' },
  { label: 'End date',         token: '{{end_date}}' },
  { label: 'Launch location',  token: '{{launch_location}}' },
];

/** Map from raw token string → human label. Includes a few auto-only tokens
 * (used by the registration confirmation) so they render as clean pills without
 * cluttering the "Insert field" menu. */
const TOKEN_LABELS: Record<string, string> = {
  ...Object.fromEntries(FIELD_TOKENS.map(f => [f.token, f.label])),
  '{{role_phrase}}': 'their role',
  '{{program}}': 'program',
};

/** Data attribute that marks a chip span in the DOM. */
const CHIP_ATTR = 'data-token';

// ── Chip HTML helpers ────────────────────────────────────────────────────────

/**
 * Build the HTML for a non-editable chip that visually represents a token.
 * The raw token value is stored in data-token; the display text is the
 * human-readable label.
 */
function chipHtml(token: string): string {
  const label = TOKEN_LABELS[token] ?? token.replace(/^\{\{|\}\}$/g, '');
  // Use contenteditable=false so it's truly non-editable inside the editor.
  return `<span ${CHIP_ATTR}="${token}" contenteditable="false" ` +
    `style="display:inline-flex;align-items:center;background:#dbeafe;color:#1d4ed8;` +
    `font-size:0.75rem;font-weight:500;padding:1px 8px;border-radius:9999px;` +
    `white-space:nowrap;user-select:none;cursor:default;" ` +
    `aria-label="${label} field">` +
    `${label}` +
    `</span>`;
}

/**
 * Convert a body_html string that may contain raw `{{token}}` placeholders
 * into chip HTML for display in the editor.
 */
export function tokenizeToChips(html: string): string {
  return html.replace(/\{\{([^}]+)\}\}/g, (match) => chipHtml(match));
}

/**
 * Convert chip spans back to raw `{{token}}` strings for saving.
 * The chip spans carry a data-token attribute with the raw token.
 */
export function chipsToTokens(html: string): string {
  // Replace chip spans with their raw token value
  return html.replace(
    /<span[^>]*data-token="(\{\{[^}]+\}\})"[^>]*>[\s\S]*?<\/span>/g,
    (_match, token: string) => token
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Strip all tags and collapse whitespace into readable plain text. */
export function htmlToText(html: string): string {
  // First convert chips to their token strings
  const withTokens = chipsToTokens(html);
  // Convert block-end tags to newlines before stripping
  const withNewlines = withTokens
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
 * Also preserves chip spans (data-token attribute).
 * Strips contenteditable attrs and all other tags → their text content.
 */
export function sanitizeHtml(raw: string): string {
  // Map divs wrapping content → paragraphs
  let html = raw
    .replace(/<div>/gi, '<p>')
    .replace(/<\/div>/gi, '</p>');

  // Preserve chip spans by temporarily replacing them
  const chips: string[] = [];
  html = html.replace(
    /<span[^>]*data-token="(\{\{[^}]+\}\})"[^>]*>[\s\S]*?<\/span>/g,
    (match) => {
      const idx = chips.length;
      chips.push(match);
      return `__CHIP_${idx}__`;
    }
  );

  // Remove plain spans
  html = html
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
    img: ['src', 'alt', 'width', 'style'],
  };

  html = html.replace(/<(\/?)([\w-]+)([^>]*)>/gi, (match, slash, tag, attrs) => {
    const lower = tag.toLowerCase();
    if (!(lower in ALLOWED)) {
      return '';
    }
    if (slash) return `</${lower}>`;

    const allowedAttrs = ALLOWED[lower];
    if (allowedAttrs.length === 0) {
      if (lower === 'br') return '<br>';
      return `<${lower}>`;
    }

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

  // Restore chip placeholders
  html = html.replace(/__CHIP_(\d+)__/g, (_, i: string) => chips[parseInt(i, 10)] ?? '');

  // Collapse empty tags and trim
  html = html
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/<p>\s*<br>\s*<\/p>/g, '')
    .trim();

  return html;
}

// ── Token preview resolution ──────────────────────────────────────────────────

export interface EventSample {
  title?: string;
  start_date?: string;
  end_date?: string;
}

/** Sample values used when no live event is available. */
const FALLBACK_SAMPLE: Record<string, string> = {
  '{{first_name}}':      'Friend',
  '{{event_title}}':     'NWKS Encounter',
  '{{start_date}}':      'Aug 7',
  '{{end_date}}':        'Aug 9',
  '{{launch_location}}': 'your launch point',
};

/**
 * Resolve tokens in HTML to sample/real values for the live preview card.
 * Replaces both raw `{{token}}` strings AND chip spans.
 * Returns HTML with no remaining `{{...}}` brackets.
 */
export function resolveTokensForPreview(
  html: string,
  event?: EventSample | null
): string {
  const vals: Record<string, string> = {
    '{{first_name}}':      'Friend',
    '{{event_title}}':     event?.title      ?? FALLBACK_SAMPLE['{{event_title}}'],
    '{{start_date}}':      event?.start_date ?? FALLBACK_SAMPLE['{{start_date}}'],
    '{{end_date}}':        event?.end_date   ?? FALLBACK_SAMPLE['{{end_date}}'],
    '{{launch_location}}': FALLBACK_SAMPLE['{{launch_location}}'],
  };

  // Replace chip spans first
  let resolved = html.replace(
    /<span[^>]*data-token="(\{\{[^}]+\}\})"[^>]*>[\s\S]*?<\/span>/g,
    (_match, token: string) => vals[token] ?? token
  );

  // Replace any remaining raw {{tokens}}
  resolved = resolved.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const t = `{{${key}}}`;
    return vals[t] ?? key;
  });

  return resolved;
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

// ── Insert-field menu ─────────────────────────────────────────────────────────

interface InsertFieldMenuProps {
  onInsert: (token: string) => void;
}

function InsertFieldMenu({ onInsert }: InsertFieldMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" data-testid="insert-field-menu">
      <button
        type="button"
        aria-label="Insert field"
        title="Insert field"
        onMouseDown={e => {
          e.preventDefault();
          setOpen(v => !v);
        }}
        className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium border border-blue-200"
      >
        Insert field ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded shadow-md min-w-max"
        >
          {FIELD_TOKENS.map(f => (
            <button
              key={f.token}
              type="button"
              role="menuitem"
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 text-gray-700"
              onMouseDown={e => {
                e.preventDefault();
                onInsert(f.token);
                setOpen(false);
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  {f.label}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── At-trigger mention menu ───────────────────────────────────────────────────

interface AtMenuProps {
  anchorRect: DOMRect | null;
  onInsert: (token: string) => void;
  onClose: () => void;
}

function AtMenu({ anchorRect, onInsert, onClose }: AtMenuProps) {
  if (!anchorRect) return null;
  return (
    <div
      role="menu"
      aria-label="Insert field"
      style={{
        position: 'fixed',
        top: anchorRect.bottom + 4,
        left: anchorRect.left,
        zIndex: 9999,
      }}
      className="bg-white border border-gray-200 rounded shadow-lg min-w-max"
    >
      <p className="px-3 py-1 text-xs text-gray-400 border-b border-gray-100">Insert field</p>
      {FIELD_TOKENS.map(f => (
        <button
          key={f.token}
          type="button"
          role="menuitem"
          className="block w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 text-gray-700"
          onMouseDown={e => {
            e.preventDefault();
            onClose();
            onInsert(f.token);
          }}
        >
          <span className="inline-block bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
            {f.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Image handling ────────────────────────────────────────────────────────────

/**
 * Read an image File, downscale it to fit `maxW` px wide (email-friendly), and
 * return a JPEG/PNG data-URI. Downscaling keeps message size reasonable so the
 * email doesn't balloon. Returns null for non-images or on failure.
 */
export function imageFileToDataUrl(file: File, maxW = 560): Promise<string | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) return resolve(null);
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onerror = () => resolve(src); // fall back to raw data-URI if decode fails
      img.onload = () => {
        try {
          const scale = img.width > maxW ? maxW / img.width : 1;
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(src);
          ctx.drawImage(img, 0, 0, w, h);
          // PNGs (logos/graphics) keep transparency; photos → JPEG for size.
          const isPng = file.type === 'image/png';
          resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.82));
        } catch {
          resolve(src);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

/** Build the <img> HTML inserted into the email body. */
function imgHtml(dataUrl: string): string {
  return `<img src="${dataUrl}" alt="" width="520" style="max-width:100%;height:auto;border-radius:6px;display:block;margin:12px 0;" />`;
}

// ── RichTextEditor ────────────────────────────────────────────────────────────

export interface RichTextEditorProps {
  /** Initial HTML value (may contain {{token}} placeholders). External changes reset the editor. */
  value: string;
  /** Called whenever the content changes. html contains {{token}} strings; text is plain. */
  onChange: (html: string, text: string) => void;
  placeholder?: string;
  /** aria-label for the editing area */
  label?: string;
  /** Optional live event data for the preview card token resolution. */
  eventSample?: EventSample | null;
  /** Show the built-in preview card. Off when a fuller preview lives elsewhere. */
  showPreview?: boolean;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start typing…',
  label = 'Email body',
  eventSample,
  showPreview = true,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // We track the serialised form ({{tokens}}) as the canonical value.
  const lastTokensRef = useRef<string>('');
  // Track active format states for toolbar
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});
  // @ trigger menu state
  const [atMenuAnchor, setAtMenuAnchor] = useState<DOMRect | null>(null);
  // Track if we just opened the @ menu so we don't close it immediately
  const atTriggerRef = useRef(false);

  // Initialise / reset when external value changes (e.g. switching templates).
  // We convert {{tokens}} → chips for display.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== lastTokensRef.current) {
      el.innerHTML = tokenizeToChips(value);
      lastTokensRef.current = value;
    }
  }, [value]);

  /** Emit the current editor state: chips → {{tokens}} in html, plain text. */
  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const rawInner = el.innerHTML;
    // Sanitize, preserving chip spans
    const sanitized = sanitizeHtml(rawInner);
    // Serialize chips back to {{tokens}}
    const tokenHtml = chipsToTokens(sanitized);
    const text = htmlToText(tokenHtml);
    lastTokensRef.current = tokenHtml;
    onChange(tokenHtml, text);
  }, [onChange]);

  const updateToolbarState = useCallback(() => {
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
    });
  }, []);

  function execCmd(cmd: string, val?: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
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

  /** Insert a chip for the given token at the current cursor position. */
  function insertTokenChip(token: string) {
    const el = editorRef.current;
    if (!el) return;
    el.focus();

    const html = chipHtml(token);
    // Try execCommand first (real browsers). Fall back to appending for jsdom/test environments.
    try {
      const supported = document.execCommand('insertHTML', false, html + '&#8203;');
      if (!supported) throw new Error('not supported');
    } catch {
      // Fallback: append chip to end of editor (works in test env where execCommand is unavailable)
      const tmp = document.createElement('span');
      tmp.innerHTML = html + '​';
      el.appendChild(tmp.firstChild!);
    }
    emit();
  }

  /** Insert an <img> at the caret from a downscaled data-URI. */
  function insertImageHtml(dataUrl: string) {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const html = imgHtml(dataUrl);
    try {
      const supported = document.execCommand('insertHTML', false, html + '<p><br></p>');
      if (!supported) throw new Error('not supported');
    } catch {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      if (tmp.firstChild) el.appendChild(tmp.firstChild);
    }
    emit();
  }

  /** Downscale + insert a batch of image files (from picker, drop, or paste). */
  async function handleImageFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(f => f.type.startsWith('image/'));
    for (const file of list) {
      const dataUrl = await imageFileToDataUrl(file);
      if (dataUrl) insertImageHtml(dataUrl);
    }
  }

  function handlePickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      void handleImageFiles(e.target.files);
    }
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    const files = e.dataTransfer?.files;
    if (files && Array.from(files).some(f => f.type.startsWith('image/'))) {
      e.preventDefault();
      void handleImageFiles(files);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) imageFiles.push(f);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      void handleImageFiles(imageFiles);
    }
  }

  /** Handle @ / / keyboard trigger to open the field menu. */
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === '@' || e.key === '/') {
      // Let the character be inserted first, then open the menu
      atTriggerRef.current = true;
      requestAnimationFrame(() => {
        // Get the caret position for menu anchoring
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          setAtMenuAnchor(rect);
        }
        atTriggerRef.current = false;
      });
    } else if (e.key === 'Escape') {
      setAtMenuAnchor(null);
    }
  }

  /** When a chip is inserted via the @ menu, also delete the trigger char. */
  function handleAtMenuInsert(token: string) {
    setAtMenuAnchor(null);
    const el = editorRef.current;
    if (!el) return;
    el.focus();

    // Delete the @ or / that triggered the menu
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      // Move range back 1 char to select the trigger character
      try {
        range.setStart(range.startContainer, Math.max(0, (range.startOffset as number) - 1));
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('delete', false);
      } catch {
        // ignore if we can't move back
      }
    }

    insertTokenChip(token);
  }

  // Build preview HTML by resolving tokens to sample values
  const previewHtml = resolveTokensForPreview(
    tokenizeToChips(value),
    eventSample
  );

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
        <ToolbarBtn
          title="Insert photo"
          onClick={() => fileInputRef.current?.click()}
        >
          📷 Photo
        </ToolbarBtn>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          aria-label="Upload photo"
          data-testid="photo-input"
          onChange={handlePickerChange}
        />
        <ToolbarBtn title="Clear formatting" onClick={() => execCmd('removeFormat')}>
          Tx
        </ToolbarBtn>
        <div className="w-px h-5 bg-gray-300 mx-0.5" />
        <InsertFieldMenu onInsert={insertTokenChip} />
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
        onKeyDown={handleKeyDown}
        onKeyUp={updateToolbarState}
        onMouseUp={updateToolbarState}
        onClick={() => setAtMenuAnchor(null)}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      />

      {/* @ trigger menu (rendered as fixed overlay) */}
      {atMenuAnchor && (
        <AtMenu
          anchorRect={atMenuAnchor}
          onInsert={handleAtMenuInsert}
          onClose={() => setAtMenuAnchor(null)}
        />
      )}

      {/* Live preview — tokens resolved to real/sample values */}
      {showPreview && (
      <div className="border-t border-gray-200 bg-gray-50 px-3 py-2">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Preview</p>
        <div
          data-testid="email-preview"
          className="text-sm text-gray-700 prose prose-sm max-w-none
            bg-white rounded border border-gray-100 px-4 py-3
            prose-h2:text-base prose-h2:font-semibold prose-h2:mt-2 prose-h2:mb-1
            prose-p:my-1 prose-ul:my-1 prose-ol:my-1"
          /* eslint-disable-next-line react/no-danger */
          dangerouslySetInnerHTML={{
            __html: previewHtml || '<p class="text-gray-400 italic">Nothing to preview yet…</p>',
          }}
        />
      </div>
      )}
    </div>
  );
}
