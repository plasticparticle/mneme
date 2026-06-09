import { render } from 'preact';
import './styles/tokens.css';
import { App } from './app';
import { AppDataProvider } from './state/data';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');

render(
  <AppDataProvider>
    <App />
  </AppDataProvider>,
  root,
);
