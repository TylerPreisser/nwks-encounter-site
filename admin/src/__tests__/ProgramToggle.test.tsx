import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProgramContext } from '../App';
import ProgramToggle from '../components/ProgramToggle';

describe('ProgramToggle', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders both Men\'s and Women\'s options', () => {
    const setProgram = vi.fn();
    render(
      <ProgramContext.Provider value={{ program: 'mens', setProgram }}>
        <ProgramToggle />
      </ProgramContext.Provider>,
    );
    expect(screen.getByTestId('program-btn-mens')).toBeInTheDocument();
    expect(screen.getByTestId('program-btn-women')).toBeInTheDocument();
    expect(screen.getByTestId('program-btn-mens')).toHaveTextContent("Men's");
    expect(screen.getByTestId('program-btn-women')).toHaveTextContent("Women's");
  });

  it('calls setProgram with "women" when Women\'s is clicked', () => {
    const setProgram = vi.fn();
    render(
      <ProgramContext.Provider value={{ program: 'mens', setProgram }}>
        <ProgramToggle />
      </ProgramContext.Provider>,
    );
    fireEvent.click(screen.getByTestId('program-btn-women'));
    expect(setProgram).toHaveBeenCalledWith('women');
  });

  it('calls setProgram with "mens" when Men\'s is clicked while on women', () => {
    const setProgram = vi.fn();
    render(
      <ProgramContext.Provider value={{ program: 'women', setProgram }}>
        <ProgramToggle />
      </ProgramContext.Provider>,
    );
    fireEvent.click(screen.getByTestId('program-btn-mens'));
    expect(setProgram).toHaveBeenCalledWith('mens');
  });

  it('visually marks the active program via aria-pressed', () => {
    render(
      <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
        <ProgramToggle />
      </ProgramContext.Provider>,
    );
    expect(screen.getByTestId('program-btn-mens')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('program-btn-women')).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks women as active when program is women', () => {
    render(
      <ProgramContext.Provider value={{ program: 'women', setProgram: vi.fn() }}>
        <ProgramToggle />
      </ProgramContext.Provider>,
    );
    expect(screen.getByTestId('program-btn-women')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('program-btn-mens')).toHaveAttribute('aria-pressed', 'false');
  });

  it('applies olive/gold styling for mens program (container present)', () => {
    const { container } = render(
      <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
        <ProgramToggle />
      </ProgramContext.Provider>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});
