import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { applyMigrations } from './setup';
import { sendEmail, renderTemplate } from '../email';
import type { Env } from '../app';

// ── Resend mock ───────────────────────────────────────────────────────────────
// We use vi.mock so the factory runs before the module import.
// The mock is controlled via the `resendResponse` variable.
let resendResponse: { data: { id: string } | null; error: { message: string; name: string } | null } = {
  data: { id: 'fake-id' },
  error: null,
};
let resendThrow: Error | null = null;

vi.mock('resend', () => {
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: {
        send: vi.fn().mockImplementation(async () => {
          if (resendThrow) throw resendThrow;
          return resendResponse;
        }),
      },
    })),
  };
});

// ─────────────────────────────────────────────────────────────────────────────

/** Minimal Env that reports EMAIL_ENABLED=false (no Resend calls). */
function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...(env as any),
    EMAIL_ENABLED: 'false',
    EMAIL_FROM: 'NWKS Encounter <noreply@nwksencounter.com>',
    EMAIL_REPLY_TO: '',
    RESEND_API_KEY: 'test_key',
    ...overrides,
  };
}

describe('email.ts', () => {
  beforeEach(async () => {
    await applyMigrations(env as any);
    // Reset mock state
    resendResponse = { data: { id: 'fake-id' }, error: null };
    resendThrow = null;
    vi.clearAllMocks();
  });

  // ─── renderTemplate ──────────────────────────────────────────────────────

  describe('renderTemplate()', () => {
    const tpl = {
      subject: 'Hello {{first_name}}!',
      body_html: '<p>Welcome, {{first_name}} {{last_name}}.</p>',
      body_text: 'Welcome, {{first_name}} {{last_name}}.',
    };

    it('substitutes all provided tokens', () => {
      const result = renderTemplate(tpl, { first_name: 'John', last_name: 'Doe' });
      expect(result.subject).toBe('Hello John!');
      expect(result.html).toBe('<p>Welcome, John Doe.</p>');
      expect(result.text).toBe('Welcome, John Doe.');
    });

    it('leaves unknown tokens unchanged', () => {
      const result = renderTemplate(tpl, { first_name: 'Jane' });
      expect(result.subject).toBe('Hello Jane!');
      expect(result.text).toContain('{{last_name}}');
    });

    it('handles an empty vars object', () => {
      const result = renderTemplate(tpl, {});
      expect(result.subject).toBe('Hello {{first_name}}!');
    });

    it('replaces every occurrence of a repeated token', () => {
      const t = { subject: '{{x}} {{x}}', body_html: '{{x}}', body_text: '{{x}}' };
      const result = renderTemplate(t, { x: 'HI' });
      expect(result.subject).toBe('HI HI');
    });
  });

  // ─── sendEmail — EMAIL_ENABLED=false ────────────────────────────────────

  describe('sendEmail() — EMAIL_ENABLED=false', () => {
    it('returns {ok:true, skipped:true} without calling Resend', async () => {
      const e = makeEnv({ EMAIL_ENABLED: 'false' });
      const result = await sendEmail(e, {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Hi</p>',
        text: 'Hi',
        program: 'mens',
      });
      expect(result.ok).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.providerId).toBeUndefined();
    });

    it('writes an email_log row with status=queued and a sent_at timestamp when skipped', async () => {
      const e = makeEnv({ EMAIL_ENABLED: 'false' });
      await sendEmail(e, {
        to: 'logged@example.com',
        subject: 'Log Test',
        html: '<p>Hi</p>',
        text: 'Hi',
        program: 'mens',
      });

      const row = await (env as any).DB
        .prepare(`SELECT * FROM email_log WHERE to_email='logged@example.com'`)
        .first<{ status: string; to_email: string; sent_at: string | null }>();
      expect(row).not.toBeNull();
      expect(row!.to_email).toBe('logged@example.com');
      expect(row!.status).toBe('queued');
      // Guard: audit trail must include a completion timestamp even when skipped
      expect(row!.sent_at).toBeTruthy();
    });

    it('does NOT call resend.emails.send when skipped', async () => {
      // Import the mocked resend to get the mock instance
      const { Resend } = await import('resend');
      const e = makeEnv({ EMAIL_ENABLED: 'false' });
      await sendEmail(e, {
        to: 'noresend@example.com',
        subject: 'No Resend',
        html: '<p>Hi</p>',
        text: 'Hi',
        program: 'mens',
      });
      // The Resend constructor should NOT have been called
      expect(Resend).not.toHaveBeenCalled();
    });
  });

  // ─── sendEmail — EMAIL_ENABLED=true ─────────────────────────────────────

  describe('sendEmail() — EMAIL_ENABLED=true', () => {
    it('writes status=sent and returns providerId on Resend success', async () => {
      resendResponse = { data: { id: 'resend-fake-id-001' }, error: null };
      const e = makeEnv({
        EMAIL_ENABLED: 'true',
        RESEND_API_KEY: 're_test_key',
        EMAIL_FROM: 'NWKS <noreply@nwksencounter.com>',
      });

      const result = await sendEmail(e, {
        to: 'success@example.com',
        subject: 'Success Subject',
        html: '<p>Success</p>',
        text: 'Success',
        program: 'mens',
      });

      expect(result.ok).toBe(true);
      expect(result.providerId).toBe('resend-fake-id-001');
      expect(result.skipped).toBeUndefined();

      const row = await (env as any).DB
        .prepare(`SELECT * FROM email_log WHERE to_email='success@example.com'`)
        .first<{ status: string; provider_id: string }>();
      expect(row).not.toBeNull();
      expect(row!.status).toBe('sent');
      expect(row!.provider_id).toBe('resend-fake-id-001');
    });

    it('writes status=failed and returns {ok:false,error} on Resend error response', async () => {
      resendResponse = {
        data: null,
        error: { message: 'Invalid API key', name: 'validation_error' },
      };
      const e = makeEnv({ EMAIL_ENABLED: 'true', RESEND_API_KEY: 're_bad_key' });

      const result = await sendEmail(e, {
        to: 'fail@example.com',
        subject: 'Fail Subject',
        html: '<p>Fail</p>',
        text: 'Fail',
        program: 'mens',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Invalid API key');

      const row = await (env as any).DB
        .prepare(`SELECT * FROM email_log WHERE to_email='fail@example.com'`)
        .first<{ status: string; error: string }>();
      expect(row).not.toBeNull();
      expect(row!.status).toBe('failed');
    });

    it('writes status=failed and returns {ok:false,error} when Resend throws', async () => {
      resendThrow = new Error('Network failure');
      const e = makeEnv({ EMAIL_ENABLED: 'true', RESEND_API_KEY: 're_throw_key' });

      const result = await sendEmail(e, {
        to: 'throw@example.com',
        subject: 'Throw Subject',
        html: '<p>Throw</p>',
        text: 'Throw',
        program: 'mens',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Network failure');

      const row = await (env as any).DB
        .prepare(`SELECT * FROM email_log WHERE to_email='throw@example.com'`)
        .first<{ status: string; error: string }>();
      expect(row).not.toBeNull();
      expect(row!.status).toBe('failed');
      expect(row!.error).toBe('Network failure');
    });
  });
});
