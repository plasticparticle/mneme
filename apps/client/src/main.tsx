import { render } from 'preact';
import './styles/tokens.css';
import { App } from './app';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');

render(<App />, root);
