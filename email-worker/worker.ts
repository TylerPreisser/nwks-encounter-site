// email-worker/worker.ts
// Cloudflare Email Worker — receives inbound testimony emails and stores them via the ingest engine.
// Triggered automatically by Cloudflare Email Routing (not HTTP requests).

import PostalMime from 'postal-mime';
import type { Env } from '../functions/_api/app';
import { storeTestimony } from '../functions/_api/testimonies/ingest';
import type { ParsedTestimony } from '../functions/_api/testimonies/ingest';

// ---------------------------------------------------------------------------
// Types — Cloudflare Email Worker message shape
// ---------------------------------------------------------------------------

/** Subset of the ForwardableEmailMessage provided by the Workers runtime. */
interface EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
}

// ---------------------------------------------------------------------------
// parseMime — extract structured fields from raw MIME bytes via postal-mime
// ---------------------------------------------------------------------------

interface ParsedMime {
  from_email: string;
  from_name: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  received_at: string;
  attachments: Array<{
    filename: string | null;
    content_type: string | null;
    size: number | null;
    link_url: null;
  }>;
}

export async function parseMime(raw: ReadableStream<Uint8Array>, fallbackFrom: string): Promise<ParsedMime> {
  // postal-mime accepts ReadableStream directly (via its own resolveStream path),
  // Uint8Array, ArrayBuffer, or string. Passing the stream directly avoids any
  // ArrayBuffer cross-context identity issues in miniflare/workerd.
  const parsed = await PostalMime.parse(raw);

  // Resolve sender display name and address
  const fromAddr = parsed.from?.address ?? fallbackFrom;
  const fromName = parsed.from?.name ?? fromAddr.split('@')[0] ?? '';

  // Resolve received_at from Date header or now
  const dateStr = parsed.date;
  let received_at: string;
  if (dateStr) {
    try {
      received_at = new Date(dateStr).toISOString();
    } catch {
      received_at = new Date().toISOString();
    }
  } else {
    received_at = new Date().toISOString();
  }

  // Map attachments — we store metadata only; actual bytes go to R2 when R2 is enabled.
  const attachments = (parsed.attachments ?? []).map((att) => {
    // TODO(R2): When R2 is enabled, upload att.content (ArrayBuffer) to env.PHOTOS
    // (or a dedicated testimony attachments bucket) and store the resulting r2_key
    // on the testimony_attachment row instead of leaving link_url null.
    // Example:
    //   const r2Key = `testimony-attachments/${testimonyId}/${att.filename}`;
    //   await env.PHOTOS.put(r2Key, att.content);
    return {
      filename: att.filename ?? null,
      content_type: att.mimeType ?? null,
      size: att.content ? att.content.byteLength : null,
      link_url: null as null,
    };
  });

  return {
    from_email: fromAddr,
    from_name: fromName,
    subject: parsed.subject ?? null,
    body_text: parsed.text ?? null,
    body_html: parsed.html ?? null,
    received_at,
    attachments,
  };
}

// ---------------------------------------------------------------------------
// Email Worker default export
// ---------------------------------------------------------------------------

export default {
  async email(message: EmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    let parsed: ParsedTestimony;

    try {
      const mimeData = await parseMime(message.raw, message.from);
      parsed = {
        from_email: mimeData.from_email,
        from_name: mimeData.from_name,
        subject: mimeData.subject,
        body_text: mimeData.body_text,
        body_html: mimeData.body_html,
        received_at: mimeData.received_at,
        attachments: mimeData.attachments,
        type: 'testimony',
      };
    } catch (err) {
      // Parse failure — store a minimal record so nothing is lost.
      // We never throw out of email() to avoid bouncing the sender.
      console.error('[email-worker] MIME parse failed:', err);
      parsed = {
        from_email: message.from ?? 'unknown@unknown',
        from_name: message.from?.split('@')[0] ?? 'Unknown',
        subject: message.headers?.get('subject') ?? null,
        body_text: '[MIME parse failed — raw email could not be decoded]',
        received_at: new Date().toISOString(),
        type: 'testimony',
      };
    }

    try {
      const result = await storeTestimony(env, parsed);
      console.log(
        `[email-worker] stored testimony id=${result.testimony_id} matched=${result.matched} from=${parsed.from_email}`
      );
    } catch (err) {
      // storeTestimony failure — log but never throw so the email isn't bounced.
      console.error('[email-worker] storeTestimony failed:', err);
    }
  },
};
