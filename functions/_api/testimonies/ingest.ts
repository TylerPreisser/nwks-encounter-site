// functions/_api/testimonies/ingest.ts
// Framework-agnostic core for parsing, matching, and storing testimonies.
// Called by the Email Worker and the admin API.

import type { Env } from '../app';
import { nowIso } from '../db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchResult {
  person_id: number | null;
  program: 'mens' | 'women' | null;
  confidence: 'email' | 'name' | 'none';
}

export interface ParsedTestimony {
  from_email: string;
  from_name: string;
  subject?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  received_at?: string | null;
  type?: 'testimony' | 'teaching';
  attachments?: Array<{
    filename?: string | null;
    content_type?: string | null;
    size?: number | null;
    link_url?: string | null;
  }>;
}

export interface StoreResult {
  testimony_id: number;
  matched: boolean;
}

// ---------------------------------------------------------------------------
// matchTestimonyToPerson
// ---------------------------------------------------------------------------

/**
 * Attempts to match an incoming email sender to a people record.
 *
 * Priority:
 *   1. Exact lowercased email match (cross-program, excludes merged rows).
 *   2. Fuzzy name match: parse fromName into first+last, query by last_name
 *      (+ first_name if both present), excludes merged rows.
 *
 * Returns the matched person's id + program, or nulls + 'none'.
 */
export async function matchTestimonyToPerson(
  env: Env,
  fromEmail: string,
  fromName: string
): Promise<MatchResult> {
  const db = env.DB;

  // --- 1. Exact email match ---
  const emailLower = fromEmail.trim().toLowerCase();
  if (emailLower) {
    const row = await db
      .prepare(
        `SELECT id, program FROM people
         WHERE LOWER(email) = ? AND merged_into_id IS NULL
         LIMIT 1`
      )
      .bind(emailLower)
      .first<{ id: number; program: 'mens' | 'women' }>();

    if (row) {
      return { person_id: row.id, program: row.program, confidence: 'email' };
    }
  }

  // --- 2. Fuzzy name match ---
  const nameParts = fromName.trim().split(/\s+/).filter(Boolean);
  if (nameParts.length > 0) {
    const lastName = nameParts[nameParts.length - 1];
    const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : null;

    let nameRow: { id: number; program: 'mens' | 'women' } | null = null;

    if (firstName) {
      nameRow = await db
        .prepare(
          `SELECT id, program FROM people
           WHERE LOWER(last_name) = LOWER(?)
             AND LOWER(first_name) = LOWER(?)
             AND merged_into_id IS NULL
           LIMIT 1`
        )
        .bind(lastName, firstName)
        .first<{ id: number; program: 'mens' | 'women' }>();
    } else {
      nameRow = await db
        .prepare(
          `SELECT id, program FROM people
           WHERE LOWER(last_name) = LOWER(?)
             AND merged_into_id IS NULL
           LIMIT 1`
        )
        .bind(lastName)
        .first<{ id: number; program: 'mens' | 'women' }>();
    }

    if (nameRow) {
      return { person_id: nameRow.id, program: nameRow.program, confidence: 'name' };
    }
  }

  return { person_id: null, program: null, confidence: 'none' };
}

// ---------------------------------------------------------------------------
// extractLinks
// ---------------------------------------------------------------------------

const URL_REGEX = /https?:\/\/[^\s<>"']+/g;

/**
 * Extracts all http/https URLs from body text.
 * Returns a deduplicated array of URL strings.
 */
export function extractLinks(bodyText: string): string[] {
  if (!bodyText) return [];
  const matches = bodyText.match(URL_REGEX) ?? [];
  return [...new Set(matches)];
}

// ---------------------------------------------------------------------------
// storeTestimony
// ---------------------------------------------------------------------------

/**
 * Runs the person matcher, inserts the testimony row, inserts attachment rows
 * (r2_key NULL for all), and inserts extracted body-link rows as attachments.
 *
 * Always sets status = 'new'.
 */
export async function storeTestimony(
  env: Env,
  parsed: ParsedTestimony
): Promise<StoreResult> {
  const db = env.DB;
  const now = nowIso();

  const match = await matchTestimonyToPerson(env, parsed.from_email, parsed.from_name);

  // Insert testimony row
  const { meta } = await db
    .prepare(
      `INSERT INTO testimonies
         (type, person_id, program, from_email, from_name, subject,
          body_text, body_html, match_confidence, status, received_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`
    )
    .bind(
      parsed.type ?? 'testimony',
      match.person_id,
      match.program,
      parsed.from_email,
      parsed.from_name,
      parsed.subject ?? null,
      parsed.body_text ?? null,
      parsed.body_html ?? null,
      match.confidence,
      parsed.received_at ?? null,
      now
    )
    .run();

  const testimonyId = meta.last_row_id as number;

  // Track link_urls already used so we don't duplicate body links with explicit attachment urls
  const usedLinkUrls = new Set<string>();

  // Insert explicit attachment rows
  const attachments = parsed.attachments ?? [];
  for (const att of attachments) {
    if (att.link_url) usedLinkUrls.add(att.link_url);
    await db
      .prepare(
        `INSERT INTO testimony_attachments
           (testimony_id, filename, content_type, size, r2_key, link_url, created_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?)`
      )
      .bind(
        testimonyId,
        att.filename ?? null,
        att.content_type ?? null,
        att.size ?? null,
        att.link_url ?? null,
        now
      )
      .run();
  }

  // Insert body-link rows (skip already-inserted link_urls)
  const bodyLinks = extractLinks(parsed.body_text ?? '');
  for (const url of bodyLinks) {
    if (usedLinkUrls.has(url)) continue;
    usedLinkUrls.add(url);
    await db
      .prepare(
        `INSERT INTO testimony_attachments
           (testimony_id, filename, content_type, size, r2_key, link_url, created_at)
         VALUES (?, ?, NULL, NULL, NULL, ?, ?)`
      )
      .bind(testimonyId, url, url, now)
      .run();
  }

  return { testimony_id: testimonyId, matched: match.confidence !== 'none' };
}
