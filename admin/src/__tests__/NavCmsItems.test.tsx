// admin/src/__tests__/NavCmsItems.test.tsx
// Verifies Forms and Web Page Details nav items are present.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProgramContext } from '../App';
import Nav from '../components/Nav';

vi.mock('../api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, program_new: 0, unassigned_new: 0 }),
  setApiProgram: vi.fn(),
}));

import { apiFetch } from '../api';
const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

function renderNav(program: 'mens' | 'women' = 'mens') {
  return render(
    <ProgramContext.Provider value={{ program, setProgram: vi.fn() }}>
      <MemoryRouter initialEntries={['/']}>
        <Nav />
      </MemoryRouter>
    </ProgramContext.Provider>,
  );
}

describe('Nav — CMS items', () => {
  beforeEach(() => {
    mockApiFetch.mockResolvedValue({ ok: true, program_new: 0, unassigned_new: 0 });
  });

  it('renders a "Forms" nav link', () => {
    renderNav();
    expect(screen.getByText('Forms')).toBeInTheDocument();
  });

  it('renders a "Web Page Details" nav link', () => {
    renderNav();
    expect(screen.getByText('Web Page Details')).toBeInTheDocument();
  });

  it('"Forms" link points to /forms', () => {
    const { container } = renderNav();
    const link = Array.from(container.querySelectorAll('a')).find(
      (a) => a.textContent?.trim() === 'Forms',
    );
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toBe('/forms');
  });

  it('"Web Page Details" link points to /page-details', () => {
    const { container } = renderNav();
    const link = Array.from(container.querySelectorAll('a')).find(
      (a) => a.textContent?.trim() === 'Web Page Details',
    );
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toBe('/page-details');
  });

  it('nav has SVG icons for all items (Gallery removed → 7)', () => {
    const { container } = renderNav();
    const nav = container.querySelector('nav');
    const svgs = nav!.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(7);
  });
});
