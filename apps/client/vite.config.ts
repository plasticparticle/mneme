import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// The single web codebase for the PWA and (later) the Tauri shells.
// PWA/Workbox plugin and wa-sqlite COOP-free OPFS wiring land in later build steps (§10).
export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5173,
  },
});
