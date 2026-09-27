import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Installable, offline-capable web app (skipped inside the native Capacitor shell, which
// already bundles every file).
if ('serviceWorker' in navigator && import.meta.env.PROD && !window.Capacitor) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
