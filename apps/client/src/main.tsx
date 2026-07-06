import { render } from 'preact';
import type { VNode } from 'preact';
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
