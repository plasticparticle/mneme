import { render } from 'preact';
import type { VNode } from 'preact';
// Self-hosted UI fonts, bundled by Vite — no external CDN, so the app renders
// offline and under the Tauri custom-scheme origin (where a CDN <link> in the
// PWA index.html would be blocked). Variable fonts cover every weight the design
// uses; Newsreader also loads italic for the serif editor's emphasis runs.
import '@fontsource-variable/hanken-grotesk/index.css';
import '@fontsource-variable/newsreader/index.css';
import '@fontsource-variable/newsreader/wght-italic.css';
import '@fontsource-variable/spline-sans-mono/index.css';
import './styles/tokens.css';
import { App } from './app';
import { AppDataProvider } from './state/data';
import { I18nProvider, initI18n, useI18n } from './i18n';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');

// Subscribes to locale changes above the whole tree: switching language
// re-renders every screen, so plain t() calls in components stay fresh.
function Root(): VNode {
  useI18n();
  return (
    <AppDataProvider>
      <App />
    </AppDataProvider>
  );
}

// Restore the persisted language (and RTL direction) before first paint.
void initI18n().then(() => {
  render(
    <I18nProvider>
      <Root />
    </I18nProvider>,
    root,
  );
});
