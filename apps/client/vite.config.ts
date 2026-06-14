import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// The single web codebase for the PWA and (later) the Tauri shells.
// PWA/Workbox plugin and wa-sqlite COOP-free OPFS wiring land in later build steps (§10).
export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5173,
  },
  // esbuild ≥0.28 refuses to *lower* destructuring when it's entangled with
  // private-field lowering (the wa-sqlite OPFS worker does both), erroring out
  // for the default broad target. Destructuring is natively supported by every
  // target we ship to (ES2015+; chrome87/es2020/firefox78/safari14 all have it),
  // so mark it supported — esbuild then leaves it as-is instead of lowering, and
  // the build stops trying an unsupported transform. No browser-support change.
  esbuild: {
    supported: { destructuring: true },
  },
});
