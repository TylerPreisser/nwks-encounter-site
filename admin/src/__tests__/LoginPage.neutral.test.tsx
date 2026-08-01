import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';
import { applyTheme } from '../theme';

/**
 * The login screen must NOT wear a program's colours: nobody has chosen a
 * program yet at that point, so the tint is just whatever the last user left
 * behind. These tests pin the neutral palette in place.
 *
 * They scan the rendered markup for the brand hexes rather than reading
 * getComputedStyle, because jsdom does not resolve `var()` — a component could
 * "compute" to nothing and still be shipping olive. The markup is the honest
 * artifact here: if a brand hex is not in it, it cannot be painted.
 */
const BRAND_HEXES = [
  '#3D4127', // men's primary — deep olive
  '#6B7645', // men's accent / the old login fallback
  '#8A9A50',
  '#B8972A', // gold
  '#F2EFE6', // parchment
  '#F5F3EC',
  '#6B2740', // women's primary — deep plum-rose
  '#A0536A', // rose
  '#C4849A',
  '#D4748C',
  '#FDF5F7', // blush
];

function expectNoBrandColour(html: string) {
  const hay = html.toLowerCase();
  for (const hex of BRAND_HEXES) {
    expect(hay, `brand colour ${hex} leaked onto the login screen`).not.toContain(
      hex.toLowerCase(),
    );
  }
}

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LoginPage — neutral, program-free styling', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Worst case for this screen: someone signed in under a program last time,
    // so <html> is still carrying that program's variables when login renders.
    applyTheme('women');
  });

  afterEach(() => {
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-program');
  });

  it('paints no program colour, even with a program theme active on <html>', () => {
    const { container } = render(<MemoryRouter><LoginPage /></MemoryRouter>);
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#6B2740');
    expectNoBrandColour(container.innerHTML);
  });

  it('re-points the theme variables locally instead of trusting the fallbacks', () => {
    const { container } = render(<MemoryRouter><LoginPage /></MemoryRouter>);
    const shell = container.querySelector('.nwks-login') as HTMLElement;
    expect(shell).toBeTruthy();
    // A `var(--color-primary, #fallback)` would still resolve to the program
    // colour set on <html>; only a local redefinition actually neutralises it.
    expect(shell.style.getPropertyValue('--color-primary')).toBe('#111113');
    expect(shell.style.getPropertyValue('--color-bg')).toBe('#0B0B0C');
    expect(shell.style.getPropertyValue('--login-ink')).toBe('#111113');
  });

  it('keeps the tent emoji and the Admin Panel wording', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    expect(screen.getByText('⛺')).toBeInTheDocument();
    expect(screen.getByText('NWKS Encounter')).toBeInTheDocument();
    expect(screen.getByText('Admin Panel')).toBeInTheDocument();
  });

  it('still shows the error alert in a readable red', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, error: 'Invalid credentials' }),
      statusText: 'Unauthorized',
    });
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/email/i), 'bad@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    const alert = await screen.findByRole('alert');
    // Neutral means "no brand tint", not "no semantic colour" — a failure has
    // to still look like a failure.
    expect(alert.style.color).toBe('rgb(140, 29, 24)');
  });

  it('carries the neutral palette into the two-factor step inside the card', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      // passkey: false keeps the challenge on the email mode, so the component
      // does not reach for the WebAuthn browser API during the test.
      json: async () => ({
        two_factor_required: true,
        methods: { passkey: false, email: true, duo: true },
      }),
      statusText: 'OK',
    });
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'right');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    const challenge = await screen.findByTestId('two-factor-challenge');
    await waitFor(() => expect(screen.getByTestId('send-email-code')).toBeInTheDocument());
    expectNoBrandColour(challenge.innerHTML);
    expect(screen.getByTestId('send-email-code').style.background).toContain('--login-ink');
  });
});
