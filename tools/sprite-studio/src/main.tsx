import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './studio.css';

const container = document.getElementById('studio-root');
if (!container) throw new Error('#studio-root가 없습니다');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
