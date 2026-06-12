// "Ask my journal" — Q&A over the decrypted in-memory entries. Each question
// rebuilds the excerpt context (search-ranked + recency, ai/context.ts) and is
// answered by the configured provider, streaming. The transcript lives in
// component state only: closing the sheet (or locking) drops it; nothing about
// the conversation is ever persisted or synced.
import type { JSX, VNode } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon';
import { Btn } from './primitives';
import { useAppData } from '../state/data';
import { makeProvider } from '../ai/provider';
import { buildJournalContext, CLOUD_BUDGET_CHARS, LOCAL_BUDGET_CHARS } from '../ai/context';
import { chatSystemPrompt } from '../ai/prompts';
import { toAiError, type AiMessage } from '../ai/types';

const pStyle: JSX.CSSProperties = { fontFamily: 'var(--ui)', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 };

export function AskJournalSheet({ desk, onClose }: { desk: boolean; onClose: () => void }): VNode | null {
  const { entries, aiSettings } = useAppData();
  const [transcript, setTranscript] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [contextNote, setContextNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const provider = useMemo(() => (aiSettings?.enabled ? makeProvider(aiSettings) : null), [aiSettings]);

  useEffect(() => {
    inputRef.current?.focus();
    // Stop a stream that's still running when the sheet goes away.
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [transcript]);

  if (!provider || !aiSettings) return null;

  const send = async (): Promise<void> => {
    const q = input.trim();
    if (!q || busy) return;
    const ctx = buildJournalContext(entries, q, provider.local ? LOCAL_BUDGET_CHARS : CLOUD_BUDGET_CHARS);
    setContextNote(`Using ${ctx.entryCount} ${ctx.entryCount === 1 ? 'entry' : 'entries'} as context${ctx.truncated ? ' (truncated to fit)' : ''}`);
    const history: AiMessage[] = [...transcript, { role: 'user', content: q }];
    setTranscript([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setError('');
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await provider.chat({
        system: chatSystemPrompt(ctx.text),
        messages: history,
        signal: ac.signal,
        onToken: (t) =>
          setTranscript((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, content: last.content + t };
            return next;
          }),
      });
    } catch (e) {
      const err = toAiError(e);
      if (err.hint !== 'aborted') {
        setError(
          err.hint === 'auth'
            ? 'The API key was rejected — check it in AI settings.'
            : err.hint === 'refused'
              ? 'The model declined to answer.'
              : provider.local
                ? 'Could not reach Ollama — is it running? (ollama serve)'
                : `Request failed: ${err.message}`,
        );
        // Drop an empty assistant bubble; keep partial text if any arrived.
        setTranscript((prev) => (prev[prev.length - 1]?.content === '' ? prev.slice(0, -1) : prev));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(30,22,16,.34)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: desk ? 'center' : 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: desk ? 620 : '100%', height: desk ? 'min(70vh, 640px)' : '88%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRadius: desk ? 20 : '24px 24px 0 0', border: '1px solid var(--line)', boxShadow: '0 20px 60px rgba(30,20,12,.3)', overflow: 'hidden' }}
      >
        <div style={{ padding: desk ? '18px 22px 12px' : '14px 20px 10px', borderBottom: '1px solid var(--line)' }}>
          {!desk && <div style={{ width: 38, height: 4, borderRadius: 9, background: 'var(--line)', margin: '0 auto 12px' }} />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Icon name="feather" size={17} color="var(--accent)" />
            <h3 style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 500, color: 'var(--ink)', margin: 0, flex: 1 }}>Ask my journal</h3>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', color: provider.local ? 'var(--accent-ink)' : 'var(--ink-3)', background: provider.local ? 'var(--accent-soft)' : 'var(--paper)', border: `1px solid ${provider.local ? 'var(--accent-line)' : 'var(--line)'}`, borderRadius: 6, padding: '2px 7px' }}>
              {provider.local ? 'on this device' : 'sent to Anthropic'}
            </span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink-3)' }} aria-label="Close">
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>

        <div ref={logRef} style={{ flex: 1, overflowY: 'auto', padding: desk ? '16px 22px' : '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {transcript.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ ...pStyle, fontSize: 14, color: 'var(--ink-2)' }}>
                Ask anything about what you've written — "what did I do last weekend?", "when did I first mention the garden?", "summarize my June".
              </p>
              <p style={{ ...pStyle, fontSize: 11.5, color: 'var(--ink-3)' }}>
                Each question searches your journal afresh; the conversation is not saved.
              </p>
            </div>
          )}
          {transcript.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%', padding: '10px 14px', borderRadius: 14,
                background: m.role === 'user' ? 'var(--accent-soft)' : 'var(--paper)',
                border: `1px solid ${m.role === 'user' ? 'var(--accent-line)' : 'var(--line)'}`,
                fontFamily: m.role === 'user' ? 'var(--ui)' : 'var(--serif)',
                fontSize: m.role === 'user' ? 13.5 : 15,
                lineHeight: 1.6, color: 'var(--ink)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
              }}
            >
              {m.content || (busy && i === transcript.length - 1 ? '…' : '')}
            </div>
          ))}
          {error && <p style={{ ...pStyle, color: 'var(--accent-ink)' }}>{error}</p>}
        </div>

        <div style={{ borderTop: '1px solid var(--line)', padding: desk ? '12px 22px 16px' : '10px 18px 18px' }}>
          {contextNote && <div style={{ fontFamily: 'var(--ui)', fontSize: 11, color: 'var(--ink-3)', marginBottom: 7 }}>{contextNote}</div>}
          <form onSubmit={(e) => { e.preventDefault(); void send(); }} style={{ display: 'flex', gap: 9 }}>
            <input
              ref={inputRef}
              value={input}
              onInput={(e) => setInput((e.target as HTMLInputElement).value)}
              placeholder="Ask your journal…"
              style={{ flex: 1, fontFamily: 'var(--ui)', fontSize: 14, color: 'var(--ink)', padding: '11px 14px', borderRadius: 12, background: 'var(--paper)', border: '1px solid var(--line)', outline: 'none' }}
            />
            {busy ? (
              <Btn kind="ghost" size="md" onClick={() => abortRef.current?.abort()}>Stop</Btn>
            ) : (
              <Btn kind="primary" size="md" type="submit" style={{ opacity: input.trim() ? 1 : 0.55 }}>Ask</Btn>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
