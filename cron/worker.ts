// cron/worker.ts — Standalone Cron Worker for scheduled email campaigns and
// automatic event-advancement.
// Deployed separately from the Pages project (Cloudflare Pages does NOT support
// Cron Triggers). This Worker shares the same D1/KV/R2 bindings.
//
// Key exports (pure, unit-testable):
//   sendDueCampaigns(env, nowIso)  — process scheduled email campaigns
//   advanceCurrentEvents(env, todayYmd) — advance is_current when events end

import type { Env } from '../functions/_api/app';
import { sendCampaignById } from '../functions/_api/routes/campaigns';
import { advanceCurrentEvents } from '../functions/_api/events-advance';

interface DueCampaign {
  id: number;
  program: string;
}

/**
 * Selects email_campaigns WHERE status='scheduled' AND scheduled_for <= nowIso,
 * delegates each to sendCampaignById (which handles CAS, sending, status update),
 * and returns how many were processed (not skipped by CAS).
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
      const result = await sendCampaignById(env, campaign.id, campaign.program);
      if (!result.casRejected) {
        processed++;
      }
    } catch (err) {
      // sendCampaignById [I1] already marks 'failed' on crash; log and continue.
      console.error(`[cron] campaign ${campaign.id} error:`, err);
    }
  }

  return { processed };
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const nowIso = new Date().toISOString();
    const todayYmd = nowIso.slice(0, 10);

    // 1. Auto-advance events whose end_date has passed
    const { results: advanceResults } = await advanceCurrentEvents(env, todayYmd);
    for (const r of advanceResults) {
      if (r.advanced) {
        console.log(`[cron] ${r.program}: advanced current event ${r.fromEventId} → ${r.toEventId}`);
      } else if (r.needs_next_event) {
        console.warn(`[cron] ${r.program}: current event ended — no future event exists. Create the next event.`);
      }
    }

    // 2. Send any scheduled email campaigns that are now due
    const { processed } = await sendDueCampaigns(env, nowIso);
    console.log(`[cron] processed ${processed} scheduled campaign(s) at ${nowIso}`);
  },
};
