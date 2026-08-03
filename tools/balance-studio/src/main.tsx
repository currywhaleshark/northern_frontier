import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './balance.css';

const root = document.getElementById('balance-root');
if (root) createRoot(root).render(<StrictMode><App /></StrictMode>);
