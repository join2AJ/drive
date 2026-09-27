import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps asset paths relative so the same build runs inside
// Capacitor's Android/iOS WebView as well as on a web server.
export default defineConfig({
  base: './',
  plugins: [react()],
});
