import React, { createContext, useContext, useState } from 'react';
import type { Program } from '../theme';
import { setApiProgram } from '../api';

interface ProgramContextValue {
  program: Program;
  setProgram: (p: Program) => void;
}

const ProgramContext = createContext<ProgramContextValue | null>(null);

export function ProgramProvider({ children, defaultProgram = 'mens' }: {
  children: React.ReactNode;
  defaultProgram?: Program;
}) {
  const [program, setProgramState] = useState<Program>(defaultProgram);

  function setProgram(p: Program) {
    setProgramState(p);
    setApiProgram(p);
  }

  return (
    <ProgramContext.Provider value={{ program, setProgram }}>
      {children}
    </ProgramContext.Provider>
  );
}

export function useProgram(): ProgramContextValue {
  const ctx = useContext(ProgramContext);
  if (!ctx) throw new Error('useProgram must be used within a ProgramProvider');
  return ctx;
}
