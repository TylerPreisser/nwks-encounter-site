// functions/_api/__tests__/email-worker.test.ts
// Tests for the inbound Email Worker.
//
// Strategy:
//   1. parseMime (unit) — build a raw MIME string → ReadableStream, call parseMime,
//      assert extracted fields.
//   2. email handler integration — construct a fake ForwardableEmailMessage, invoke
//      the email() handler with a seeded D1, assert a testimony row + attachment rows.
//   3. Parse-failure fallback — corrupt raw stream → handler still stores a row.

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applyMigrations, seedAdmin } from './setup';
import { parseMime } from '../../../email-worker/worker';
import emailWorker from '../../../email-worker/worker';
import type { Env } from '../app';
import { nowIso } from '../db';

const testEnv = env as unknown as Env;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode a UTF-8 string as a ReadableStream<Uint8Array>. */
function stringToStream(raw: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(raw);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** Build a minimal raw MIME email string. */
function buildRawEmail(opts: {
  from: string;
  to?: string;
  subject?: string;
  date?: string;
  body: string;
  attachment?: { filename: string; mimeType: string; base64: string };
}): string {
  const boundary = 'testboundary001';

  // Build headers first, then join with the mandatory blank-line separator.
  // Use filter(Boolean) so optional fields (date) don't insert spurious blank lines.
  const commonHeaders = [
    `From: ${opts.from}`,
    `To: ${opts.to ?? 'testimonies@nwksencounter.com'}`,
    `Subject: ${opts.subject ?? 'Test Subject'}`,
    opts.date ? `Date: ${opts.date}` : null,
    'MIME-Version: 1.0',
  ].filter(Boolean) as string[];

  if (!opts.attachment) {
    return [
      ...commonHeaders,
      'Content-Type: text/plain; charset=utf-8',
      '',  // blank line = end of headers
      opts.body,
    ].join('\r\n');
  }

  const att = opts.attachment;
  return [
    ...commonHeaders,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',  // blank line = end of headers
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    opts.body,
    `--${boundary}`,
    `Content-Type: ${att.mimeType}`,
    `Content-Disposition: attachment; filename="${att.filename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    att.base64,
    `--${boundary}--`,
  ].join('\r\n');
}

/** Seed a person and return their id. */
async function seedPerson(opts: {
  program: 'mens' | 'women';
  firstName: string;
  lastName: string;
  email: string;
}): Promise<number> {
  const now = nowIso();
  const db = (env as unknown as { DB: D1Database }).DB;
  const { meta } = await db
    .prepare(
      `INSERT INTO people
         (program, first_name, last_name, email, times_attended, times_served, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?)`
    )
    .bind(opts.program, opts.firstName, opts.lastName, opts.email, now, now)
    .run();
  return meta.last_row_id as number;
}

/** Build a fake EmailMessage object matching the Workers runtime shape. */
function makeFakeMessage(raw: string, fromOverride?: string): {
  from: string;
  to: string;
  headers: Headers;
  raw: ReadableStream<Uint8Array>;
  rawSize: number;
} {
  const fromMatch = raw.match(/^From:\s*(.+)$/mi);
  const fromHeader = fromMatch ? fromMatch[1].trim() : (fromOverride ?? 'unknown@example.com');
  // Extract bare email from "Name <email>" or plain "email"
  const fromEmail = fromHeader.match(/<([^>]+)>/)?.[1] ?? fromHeader;
  const subjectMatch = raw.match(/^Subject:\s*(.+)$/mi);
  const headers = new Headers();
  if (subjectMatch) headers.set('subject', subjectMatch[1].trim());
  headers.set('from', fromHeader);

  const bytes = new TextEncoder().encode(raw);
  return {
    from: fromEmail,
    to: 'testimonies@nwksencounter.com',
    headers,
    raw: stringToStream(raw),
    rawSize: bytes.length,
  };
}

// ---------------------------------------------------------------------------
// parseMime — unit tests
// ---------------------------------------------------------------------------

describe('parseMime — unit', () => {
  it('extracts from address, name, subject, body_text from a plain email', async () => {
    const raw = buildRawEmail({
      from: 'Jane Doe <jane.doe@example.com>',
      subject: 'My Testimony',
      body: 'God was faithful in my life.',
    });
    const result = await parseMime(stringToStream(raw), 'jane.doe@example.com');
    expect(result.from_email).toBe('jane.doe@example.com');
    expect(result.from_name).toBe('Jane Doe');
    expect(result.subject).toBe('My Testimony');
    expect(result.body_text).toContain('God was faithful in my life.');
    expect(result.body_html).toBeNull();
    expect(Array.isArray(result.attachments)).toBe(true);
    expect(result.attachments).toHaveLength(0);
  });

  it('parses date header into ISO received_at', async () => {
    const raw = buildRawEmail({
      from: 'sender@example.com',
      date: 'Thu, 24 Jul 2026 10:00:00 +0000',
      body: 'Body',
    });
    const result = await parseMime(stringToStream(raw), 'sender@example.com');
    expect(result.received_at).toBe('2026-07-24T10:00:00.000Z');
  });

  it('falls back to now when date header is absent', async () => {
    const before = Date.now();
    const raw = buildRawEmail({
      from: 'nodateperson@example.com',
      body: 'No date header',
    });
    const result = await parseMime(stringToStream(raw), 'nodateperson@example.com');
    const after = Date.now();
    const ts = new Date(result.received_at).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 1000);
  });

  it('extracts attachment metadata with null link_url', async () => {
    const raw = buildRawEmail({
      from: 'attacher@example.com',
      subject: 'Attached testimony',
      body: 'See the attached PDF.',
      attachment: {
        filename: 'testimony.pdf',
        mimeType: 'application/pdf',
        // base64("Hello World") = "SGVsbG8gV29ybGQ="
        base64: 'SGVsbG8gV29ybGQ=',
      },
    });
    const result = await parseMime(stringToStream(raw), 'attacher@example.com');
    expect(result.attachments).toHaveLength(1);
    const att = result.attachments[0];
    expect(att.filename).toBe('testimony.pdf');
    expect(att.content_type).toBe('application/pdf');
    expect(att.link_url).toBeNull();
    // "Hello World" = 11 bytes
    expect(att.size).toBe(11);
  });

  it('uses fallbackFrom when From header is missing/unparseable', async () => {
    const raw = 'Subject: No From\r\n\r\nBody with no from header';
    const result = await parseMime(stringToStream(raw), 'fallback@example.com');
    // postal-mime will parse with no from; we fall back to the argument
    expect(result.from_email).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// email() handler — integration (real D1 via miniflare)
// ---------------------------------------------------------------------------

describe('email worker handler — integration', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
    await seedAdmin();
  });

  it('stores a testimony row matched to a seeded person', async () => {
    const personId = await seedPerson({
      program: 'mens',
      firstName: 'Robert',
      lastName: 'Williams',
      email: 'robert.williams@example.com',
    });

    const raw = buildRawEmail({
      from: 'Robert Williams <robert.williams@example.com>',
      subject: 'Weekend testimony',
      body: 'God changed my life this weekend at encounter.',
    });
    const message = makeFakeMessage(raw);

    await emailWorker.email(message as any, testEnv, {} as ExecutionContext);

    const row = await testEnv.DB.prepare(
      `SELECT id, person_id, program, from_email, from_name, subject, body_text, match_confidence, status, type
       FROM testimonies ORDER BY id DESC LIMIT 1`
    ).first<{
      id: number;
      person_id: number;
      program: string;
      from_email: string;
      from_name: string;
      subject: string;
      body_text: string;
      match_confidence: string;
      status: string;
      type: string;
    }>();
    expect(row).not.toBeNull();
    expect(row!.person_id).toBe(personId);
    expect(row!.program).toBe('mens');
    expect(row!.from_email).toBe('robert.williams@example.com');
    expect(row!.from_name).toBe('Robert Williams');
    expect(row!.subject).toBe('Weekend testimony');
    expect(row!.body_text).toContain('God changed my life');
    expect(row!.match_confidence).toBe('email');
    expect(row!.status).toBe('draft_1');
    expect(row!.type).toBe('testimony');
  });

  it('stores testimony with attachment row (link_url null, r2_key null)', async () => {
    const raw = buildRawEmail({
      from: 'Julie Ramirez <julie.ramirez@example.com>',
      subject: 'With attachment',
      body: 'Please find my testimony attached.',
      attachment: {
        filename: 'testimony.pdf',
        mimeType: 'application/pdf',
        base64: 'SGVsbG8gV29ybGQ=',
      },
    });
    const message = makeFakeMessage(raw);

    await emailWorker.email(message as any, testEnv, {} as ExecutionContext);

    const testimony = await testEnv.DB.prepare(
      `SELECT id FROM testimonies ORDER BY id DESC LIMIT 1`
    ).first<{ id: number }>();
    expect(testimony).not.toBeNull();

    const atts = await testEnv.DB.prepare(
      `SELECT filename, content_type, size, r2_key, link_url
       FROM testimony_attachments WHERE testimony_id = ?`
    )
      .bind(testimony!.id)
      .all<{ filename: string; content_type: string; size: number; r2_key: null; link_url: null }>();

    // At least the explicit file attachment row (body has no URLs)
    const fileAtt = atts.results.find((a) => a.filename === 'testimony.pdf');
    expect(fileAtt).toBeDefined();
    expect(fileAtt!.content_type).toBe('application/pdf');
    expect(fileAtt!.r2_key).toBeNull();
    expect(fileAtt!.link_url).toBeNull();
  });

  it('extracts body links from email body and stores as attachment rows', async () => {
    const raw = buildRawEmail({
      from: 'link.sender@example.com',
      subject: 'Testimony doc link',
      body: 'Here is my Google Doc: https://docs.google.com/document/d/TESTID and another https://example.com/testimony',
    });
    const message = makeFakeMessage(raw);

    await emailWorker.email(message as any, testEnv, {} as ExecutionContext);

    const testimony = await testEnv.DB.prepare(
      `SELECT id FROM testimonies ORDER BY id DESC LIMIT 1`
    ).first<{ id: number }>();
    expect(testimony).not.toBeNull();

    const atts = await testEnv.DB.prepare(
      `SELECT link_url FROM testimony_attachments WHERE testimony_id = ?`
    )
      .bind(testimony!.id)
      .all<{ link_url: string }>();

    const urls = atts.results.map((a) => a.link_url);
    expect(urls).toContain('https://docs.google.com/document/d/TESTID');
    expect(urls).toContain('https://example.com/testimony');
  });

  it('stores an unmatched testimony when no person matches', async () => {
    const raw = buildRawEmail({
      from: 'nobody@ghost-domain-xyz.com',
      subject: 'Unknown person',
      body: 'I have no record in your system.',
    });
    const message = makeFakeMessage(raw);

    await emailWorker.email(message as any, testEnv, {} as ExecutionContext);

    const row = await testEnv.DB.prepare(
      `SELECT person_id, program, match_confidence FROM testimonies ORDER BY id DESC LIMIT 1`
    ).first<{ person_id: null; program: null; match_confidence: string }>();
    expect(row).not.toBeNull();
    expect(row!.person_id).toBeNull();
    expect(row!.program).toBeNull();
    expect(row!.match_confidence).toBe('none');
  });

  it('stores a minimal record on parse failure (no email is lost)', async () => {
    // Provide a stream that immediately errors to simulate a corrupt raw email.
    // We do this by passing an intentionally broken message with an invalid raw stream.
    const brokenStream = new ReadableStream({
      start(controller) {
        controller.error(new Error('simulated stream error'));
      },
    });

    const fakeMessage = {
      from: 'corrupt-sender@example.com',
      to: 'testimonies@nwksencounter.com',
      headers: new Headers({ subject: 'Broken email' }),
      raw: brokenStream,
      rawSize: 0,
    };

    // Should NOT throw
    await expect(
      emailWorker.email(fakeMessage as any, testEnv, {} as ExecutionContext)
    ).resolves.toBeUndefined();

    // But should still have stored a testimony row
    const row = await testEnv.DB.prepare(
      `SELECT from_email, body_text FROM testimonies ORDER BY id DESC LIMIT 1`
    ).first<{ from_email: string; body_text: string }>();
    expect(row).not.toBeNull();
    expect(row!.from_email).toBe('corrupt-sender@example.com');
    expect(row!.body_text).toContain('MIME parse failed');
  });
});
