import { AnthropicProvider } from './anthropic';
import { OllamaProvider } from './ollama';
import { DEFAULT_OLLAMA_URL, type AiProvider, type AiSettings } from './types';

/** Build the provider for the configured backend. Pure; no validation here. */
export function makeProvider(s: AiSettings): AiProvider {
  switch (s.backend) {
    case 'anthropic':
      return new AnthropicProvider(s.anthropic.apiKey, s.anthropic.model);
    case 'ollama':
      return new OllamaProvider(s.ollama.baseUrl || DEFAULT_OLLAMA_URL, s.ollama.model);
  }
}
