import React from 'react';
import { ProgramProvider } from './context/ProgramContext';

export default function App() {
  return (
    <ProgramProvider>
      <div className="min-h-full bg-[var(--color-bg,#F5F3EC)]">
        <header className="bg-[var(--color-primary,#6B7645)] text-white px-6 py-4">
          <h1 className="text-xl font-semibold tracking-wide">NWKS Encounter Admin</h1>
        </header>
        <main className="p-6">
          <p className="text-gray-600">Admin panel loading…</p>
        </main>
      </div>
    </ProgramProvider>
  );
}
