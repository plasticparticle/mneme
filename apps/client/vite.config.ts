import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import pkg from './package.json';

// The single web codebase for the PWA and (later) the Tauri shells.
// PWA/Workbox plugin and wa-sqlite COOP-free OPFS wiring land in later build steps (§10).
export default defineConfig({
  plugins: [preact()],
  // Build provenance, surfaced in src/buildinfo.ts (onboarding footer +
  // Preferences → Info). In dev the timestamp is the dev-server start.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
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
