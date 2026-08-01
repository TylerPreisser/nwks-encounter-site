/**
 * EncounterLogos.test.tsx
 *
 * The Upcoming Encounter page manages BOTH programs, so its header must show
 * both marks — not just the themed one. Covers:
 *  1. Both logos render with their own alt text
 *  2. They are two distinct assets (a copy/paste of one src is a real risk here)
 *  3. The divider is decorative — hidden from screen readers
 *  4. Theme colours come from CSS custom properties, not hard-coded hex
 *  5. The Events page actually renders the lockup, under either program theme
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProgramContext } from '../App';
import EncounterLogos from '../components/EncounterLogos';
import Events from '../pages/Events';

const MENS_ALT = "NWKS Men's Encounter";
const WOMENS_ALT = "NWKS Women's Encounter";

describe('EncounterLogos', () => {
  it('renders both program logos with descriptive alt text', () => {
    render(<EncounterLogos />);
    expect(screen.getByAltText(MENS_ALT)).toBeInTheDocument();
    expect(screen.getByAltText(WOMENS_ALT)).toBeInTheDocument();
  });

  it('points each logo at a different asset', () => {
    render(<EncounterLogos />);
    const mens = screen.getByAltText(MENS_ALT) as HTMLImageElement;
    const womens = screen.getByAltText(WOMENS_ALT) as HTMLImageElement;
    expect(mens.src).toBeTruthy();
    expect(womens.src).toBeTruthy();
    expect(mens.src).not.toBe(womens.src);
  });

  it('hides the divider from assistive tech', () => {
    render(<EncounterLogos />);
    const divider = screen.getByTestId('encounter-logos-divider');
    expect(divider).toHaveAttribute('aria-hidden', 'true');
    // Nothing readable between the two alt texts.
    expect(divider.textContent).toBe('');
  });

  it('themes from CSS custom properties so it re-colours per program', () => {
    render(<EncounterLogos />);
    const lockup = screen.getByTestId('encounter-logos');
    const divider = screen.getByTestId('encounter-logos-divider');
    expect(lockup.getAttribute('style')).toContain('--color-surface');
    expect(lockup.getAttribute('style')).toContain('--color-accent');
    expect(divider.getAttribute('style')).toContain('--color-secondary');
  });

  it('accepts a className for placement without needing a wrapper element', () => {
    render(<EncounterLogos className="mr-2" />);
    expect(screen.getByTestId('encounter-logos')).toHaveClass('mr-2');
  });
});

describe('Events page header', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('rollover/preview')) {
        return new Response(JSON.stringify({ ok: true, current: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, events: [] }), { status: 200 });
    });
  });

  function wrapper(program: 'mens' | 'women' = 'mens') {
    return ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>
        <ProgramContext.Provider value={{ program, setProgram: vi.fn() }}>
          {children}
        </ProgramContext.Provider>
      </MemoryRouter>
    );
  }

  it('shows both encounter logos when themed for the mens program', async () => {
    render(<Events />, { wrapper: wrapper('mens') });
    await waitFor(() => expect(screen.getByAltText(MENS_ALT)).toBeInTheDocument());
    expect(screen.getByAltText(WOMENS_ALT)).toBeInTheDocument();
  });

  it('shows both encounter logos when themed for the womens program', async () => {
    render(<Events />, { wrapper: wrapper('women') });
    await waitFor(() => expect(screen.getByAltText(WOMENS_ALT)).toBeInTheDocument());
    expect(screen.getByAltText(MENS_ALT)).toBeInTheDocument();
  });

  it('keeps the page title next to the lockup', async () => {
    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByTestId('encounter-logos')).toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 1, name: 'Events' })).toBeInTheDocument();
  });
});
