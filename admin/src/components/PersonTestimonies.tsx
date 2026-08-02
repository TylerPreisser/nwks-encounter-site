import { useState } from 'react';
import { useProgram } from '@/App';

/**
 * A person's emailed-in testimonies/teachings, shown underneath their profile.
 *
 * The rows come from GET /api/admin/people/:id (functions/_api/routes/people.ts),
 * which already scopes them to this person — an unmatched submission
 * (person_id NULL) never reaches here.
 */

export interface TestimonyAttachment {
  id: number;
  filename: string | null;
  content_type: string | null;
  size: number | null;
  link_url: string | null;
  /** Server-computed: false means there is nothing an admin can open. */
  available: boolean;
}

export interface PersonTestimony {
  id: number;
  type: string;
  title: string | null;
  topic: string | null;
  subject: string | null;
  status: string;
  body_text: string | null;
  body_html: string | null;
  from_email: string;
  from_name: string;
  received_at: string | null;
  created_at: string;
  attachments: TestimonyAttachment[];
}

/** Bodies longer than this are collapsed so the profile stays scannable. */
const COLLAPSE_AT = 600;

/**
 * Renders an HTML email body as plain text.
 *
 * Emails are attacker-controlled input, so their markup never goes through
 * dangerouslySetInnerHTML here. DOMParser builds an inert document (no script
 * execution, no resource loads); script/style subtrees are dropped so their
 * source doesn't show up as visible text.
 */
function htmlToText(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style').forEach((el) => el.remove());
    return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
  } catch {
    // Defensive: an environment without DOMParser still shouldn't blank the body.
    return html.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10240 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function AttachmentRow({ att }: { att: TestimonyAttachment }) {
  const label = att.filename ?? att.link_url ?? 'Attachment';
  const size = att.size != null ? formatBytes(att.size) : null;

  return (
    <li data-testid={`attachment-${att.id}`} className="flex flex-wrap items-baseline gap-x-3 text-sm">
      {att.available && att.link_url ? (
        <a
          href={att.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:underline"
          style={{ color: 'var(--color-primary)' }}
        >
          {label}
        </a>
      ) : (
        <span className="font-medium text-gray-700">{label}</span>
      )}
      {size && <span className="text-xs text-gray-400">{size}</span>}
      {!att.available && (
        // Never render a link we know would 404: the email worker records
        // attachment metadata only — the bytes are not stored anywhere.
        <span data-testid={`attachment-unavailable-${att.id}`} className="text-xs text-amber-700">
          — the file itself was not saved, so it can&rsquo;t be opened here. Ask the sender to
          re-send it as a link, or paste the text into the email.
        </span>
      )}
    </li>
  );
}

function TestimonyCard({ item }: { item: PersonTestimony }) {
  const { program } = useProgram();
  const [expanded, setExpanded] = useState(false);

  const heading = item.subject || item.title || item.topic || 'Untitled submission';
  const typeLabel = item.type === 'teaching' ? 'Teaching' : 'Testimony';
  const received = formatDate(item.received_at ?? item.created_at);

  const body = item.body_text?.trim()
    || (item.body_html ? htmlToText(item.body_html) : '');
  const isLong = body.length > COLLAPSE_AT;
  const shown = isLong && !expanded ? `${body.slice(0, COLLAPSE_AT)}…` : body;

  return (
    <li
      className="rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3"
      style={{ background: 'var(--color-surface)' }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          data-testid={`testimony-type-${item.id}`}
          className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
          style={{
            background: item.type === 'teaching' ? '#f3e8ff' : '#e0f2fe',
            color: item.type === 'teaching' ? '#7c3aed' : '#0369a1',
          }}
        >
          {typeLabel}
        </span>
        <h3 className="font-semibold text-gray-800">{heading}</h3>
        {received && (
          <span data-testid={`testimony-received-${item.id}`} className="ml-auto text-xs text-gray-400">
            {received}
          </span>
        )}
      </div>

      <div className="text-xs text-gray-400">
        {item.status.replace(/_/g, ' ')}
        {item.from_email && <> &middot; from {item.from_email}</>}
      </div>

      {body ? (
        <div>
          <p
            data-testid={`testimony-body-${item.id}`}
            className="text-sm text-gray-700 whitespace-pre-wrap"
          >
            {shown}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-1 text-xs font-semibold hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      ) : (
        <p data-testid={`testimony-empty-${item.id}`} className="text-sm italic text-gray-400">
          Nothing has arrived yet for this one.
        </p>
      )}

      {item.attachments.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Attachments &amp; links
          </h4>
          <ul className="space-y-1">
            {item.attachments.map((att) => (
              <AttachmentRow key={att.id} att={att} />
            ))}
          </ul>
        </div>
      )}

      {/* The board already renders a full, formatted view — reuse it rather
          than re-implementing HTML rendering inside the SPA. Hidden when
          nothing has arrived: there would be nothing on the other end. */}
      {(body || item.attachments.length > 0) && (
        <a
          href={`/api/admin/testimonies/${item.id}/view?program=${program}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs font-semibold hover:underline"
          style={{ color: 'var(--color-primary)' }}
        >
          Open full submission →
        </a>
      )}
    </li>
  );
}

export default function PersonTestimonies({ testimonies }: { testimonies: PersonTestimony[] }) {
  if (!testimonies || testimonies.length === 0) return null;

  return (
    <section data-testid="person-testimonies">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Testimonies &amp; Teachings
      </h2>
      <ul className="space-y-3">
        {testimonies.map((item) => (
          <TestimonyCard key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}
