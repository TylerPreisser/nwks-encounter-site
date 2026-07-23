import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { applyTheme } from './theme';
import type { Program } from './theme';

// Apply saved or default theme before first paint
const savedProgram = (localStorage.getItem('nwks_program') ?? 'mens') as Program;
applyTheme(savedProgram);

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
