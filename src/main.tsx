import './platform/devFrames'; // first: dev-only rAF fallback for background tabs
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import './platform/pwa';
import { getLang } from '@sdk/i18n';

document.documentElement.lang = getLang() === 'zh-TW' ? 'zh-Hant' : getLang();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
