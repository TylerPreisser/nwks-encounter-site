// cron/worker.ts — Standalone Cron Worker for scheduled email campaigns and
// automatic event-advancement.
// Deployed separately from the Pages project (Cloudflare Pages does NOT support
// Cron Triggers). This Worker shares the same D1/KV/R2 bindings.
//
// Key exports (pure, unit-testable):
//   sendDueCampaigns(env, nowIso)  — process scheduled email campaigns
//   advanceCurrentEvents(env, todayYmd) — advance is_current when events end

import type { Env } from '../functions/_api/app';
import { sendCampaignChunk, SEND_CHUNK_SIZE } from '../functions/_api/routes/campaigns';
import { needsNextEvent, PROGRAMS } from '../functions/_api/events-advance';

interface DueCampaign {
  id: number;
  program: string;
}

/**
 * Selects email_campaigns WHERE status='scheduled' AND scheduled_for <= nowIso,
 * and drains each by sending ONE bounded chunk (SEND_CHUNK_SIZE recipients) via
 * sendCampaignChunk. A campaign with more recipients re-queues itself (status back
 * to 'scheduled', due now) so the next tick continues — no single invocation ever
 * exceeds Cloudflare's CPU/subrequest budget. Returns how many campaigns advanced
 * (a chunk sent or finalized), not skipped by CAS.
 */
export async function sendDueCampaigns(
  env: Env,
  nowIso: string
): Promise<{ processed: number }> {
  const due = await env.DB.prepare(
    `SELECT id, program
     FROM email_campaigns
     WHERE status = 'scheduled' AND scheduled_for <= ?`
  ).bind(nowIso).all<DueCampaign>();

  let processed = 0;

  for (const campaign of due.results) {
    try {
      const result = await sendCampaignChunk(env, campaign.id, campaign.program, SEND_CHUNK_SIZE);
      if (!result.casRejected) {
        processed++;
      }
    } catch (err) {
      // sendCampaignChunk [I1] already marks 'failed' on crash; log and continue.
      console.error(`[cron] campaign ${campaign.id} error:`, err);
    }
  }

  return { processed };
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const nowIso = new Date().toISOString();
    const todayYmd = nowIso.slice(0, 10);

    // 1. Advisory only — advancement is MANUAL via the admin "Start Next
    //    Encounter" rollover button. Just warn when an encounter has ended so
    //    the admin knows to roll it over (protects the post-encounter email tail).
    for (const program of PROGRAMS) {
      if (await needsNextEvent(env.DB, program, todayYmd)) {
        console.warn(`[cron] ${program}: current encounter has ended — use "Start Next Encounter" to roll over.`);
      }
    }

    // 2. Send any scheduled email campaigns that are now due
    const { processed } = await sendDueCampaigns(env, nowIso);
    console.log(`[cron] processed ${processed} scheduled campaign(s) at ${nowIso}`);
  },
};
