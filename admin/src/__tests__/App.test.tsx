import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App — smoke test', () => {
  it('renders the admin header', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /NWKS Encounter Admin/i })).toBeInTheDocument();
  });

  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container.firstChild).toBeTruthy();
  });
});
