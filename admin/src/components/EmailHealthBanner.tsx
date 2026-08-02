import { useEffect, useState } from 'react';
import { apiFetch } from '@/api';

interface Health {
  configured: boolean;
  healthy: boolean;
  counts: { sent: number; failed: number; queued: number };
  last_failure: { to_email: string; error: string; created_at: string } | null;
  reason: string | null;
}

/**
 * Surfaces broken outbound email where someone will see it.
 *
 * The public forms tell people "we'll email you". If sending is misconfigured or
 * rejected, nothing visibly breaks — the office just believes confirmations went
 * out. That silence is the expensive failure, so this states it plainly and
 * quotes the provider's own error rather than a generic "something went wrong".
 */
export default function EmailHealthBanner() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    apiFetch<Health>('/admin/security/email-health').then(setHealth).catch(() => setHealth(null));
  }, []);

  if (!health || health.healthy) return null;

  return (
    <div
      role="alert"
      data-testid="email-health-banner"
      className="rounded-lg border px-4 py-3 text-sm space-y-1"
      style={{ background: '#FEF3C7', borderColor: '#FCD34D', color: '#92400E' }}
    >
      <p className="font-semibold">
        {health.configured ? 'Emails are failing to send.' : 'Email is not set up yet.'}
      </p>
      <p>
        {health.configured
          ? 'Registration confirmations and interest invitations are not reaching anyone.'
          : 'Nothing is being delivered — confirmations, invitations and sign-in codes all rely on it.'}
        {health.counts.failed > 0 && ` ${health.counts.failed} failed in the last 7 days.`}
      </p>
      {health.last_failure?.error && (
        <p className="text-xs opacity-80">Provider said: “{health.last_failure.error}”</p>
      )}
    </div>
  );
}
