import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import { App } from './App';
import { loadStore } from './lib/store';

registerSW({ immediate: true });
void loadStore();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
