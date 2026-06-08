import type { JSX, VNode, ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Icon } from '../ui/Icon';
import { Btn } from '../ui/primitives';
import { Wordmark } from '../ui/Wordmark';
import { MNEMONIC } from '../data/sample';

type View = 'welcome' | 'create' | 'confirm' | 'restore' | 'unlock';

const hStyle = (desk: boolean): JSX.CSSProperties => ({
  fontFamily: 'var(--serif)', fontWeight: 500, fontSize: desk ? 30 : 26, color: 'var(--ink)', margin: '0 0 6px', letterSpacing: 0.2,
});
const pStyle: JSX.CSSProperties = { fontFamily: 'var(--ui)', fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 };

export function Onboarding({ desk, onEnter }: { desk: boolean; onEnter: () => void }): VNode {
  const [view, setView] = useState<View>('welcome');
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const words = MNEMONIC;

  // confirm step
  const quizIdx = [2, 6, 10];
  const [picks, setPicks] = useState<Record<number, string>>({});
  const allCorrect = quizIdx.every((i) => picks[i] === words[i]);
  const decoys = ['cedar', 'gravel', 'maple', 'signal', 'orchid', 'pewter', 'driftwood', 'saffron', 'copper'];
  const options = (i: number): string[] => {
    const set = [words[i], decoys[i % decoys.length], decoys[(i + 3) % decoys.length], decoys[(i + 6) % decoys.length]];
    return set.sort((a, b) => (a > b ? 1 : -1));
  };

  // restore step
  const [restoreWords, setRestoreWords] = useState<string[]>(Array(12).fill(''));
  const restoreFilled = restoreWords.filter((w) => w.trim()).length;

  // unlock step
  const [pin, setPin] = useState('');

  const maxW = desk ? 460 : '100%';

  const wrap = (content: ComponentChildren, opts: { top?: boolean } = {}): VNode => (
    <div
      style={{
        height: '100%', width: '100%', boxSizing: 'border-box', background: 'var(--paper)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: opts.top ? 'flex-start' : 'center',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: maxW, boxSizing: 'border-box',
          padding: desk ? '40px 40px' : '78px 26px 30px',
          display: 'flex', flexDirection: 'column', flex: opts.top ? 1 : 'none',
          minHeight: opts.top ? 0 : undefined, overflow: opts.top ? 'auto' : 'visible',
        }}
      >
        {content}
      </div>
    </div>
  );

  // ─────────────── WELCOME ───────────────
  if (view === 'welcome') {
    return wrap(
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 0, margin: 'auto 0' }}>
        <div style={{ marginBottom: 26 }}>
          <svg width="56" height="56" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9.5" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="3.4" fill="var(--accent)" />
            <circle cx="12" cy="12" r="9.5" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="2 3.2" opacity="0.4" />
          </svg>
        </div>
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: desk ? 46 : 40, color: 'var(--ink)', margin: 0, letterSpacing: 0.3 }}>Mneme</h1>
        <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: desk ? 19 : 17, color: 'var(--ink-2)', margin: '14px 0 0', maxWidth: 320 }}>
          A private place to remember.
        </p>
        <p style={{ fontFamily: 'var(--ui)', fontSize: 13.5, color: 'var(--ink-3)', margin: '10px 0 0', lineHeight: 1.6, maxWidth: 300 }}>
          Everything you write is encrypted on this device before it ever leaves it. No account, no email, no password.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 340, marginTop: 34 }}>
          <Btn kind="primary" size="lg" full onClick={() => setView('create')}>Start a new journal</Btn>
          <Btn kind="ghost" size="lg" full onClick={() => setView('restore')}>I have a recovery phrase</Btn>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 30, color: 'var(--ink-3)' }}>
          <Icon name="shield" size={15} color="var(--accent)" />
          <span style={{ fontFamily: 'var(--ui)', fontSize: 12 }}>End-to-end encrypted · local-first · open source</span>
        </div>
      </div>,
    );
  }

  // ─────────────── CREATE (recovery phrase) ───────────────
  if (view === 'create') {
    return wrap(
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <BackRow onClick={() => setView('welcome')} step="Step 1 of 2" />
        <h2 style={hStyle(desk)}>Your recovery phrase</h2>
        <p style={pStyle}>
          These twelve words <strong style={{ color: 'var(--ink)' }}>are</strong> your journal. Write them down in order and keep them somewhere safe — they’re the only way back in.
        </p>

        <div style={{ position: 'relative', marginTop: 18 }}>
          <div
            style={{
              display: 'grid', gridTemplateColumns: desk ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 8,
              padding: 14, borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)',
              filter: revealed ? 'none' : 'blur(7px)', transition: 'filter .2s', userSelect: 'none',
            }}
          >
            {words.map((w, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', width: 16 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{w}</span>
              </div>
            ))}
          </div>
          {!revealed && (
            <button
              onClick={() => setRevealed(true)}
              style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink)' }}
            >
              <Icon name="eye" size={22} color="var(--ink)" />
              <span style={{ fontFamily: 'var(--ui)', fontWeight: 600, fontSize: 14 }}>Tap to reveal</span>
              <span style={{ fontFamily: 'var(--ui)', fontSize: 12, color: 'var(--ink-2)' }}>Make sure no one is watching</span>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Btn kind="ghost" size="sm" icon={revealed ? 'eyeoff' : 'eye'} onClick={() => setRevealed((r) => !r)}>{revealed ? 'Hide' : 'Reveal'}</Btn>
          <Btn kind="ghost" size="sm" icon="copy" onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }}>{copied ? 'Copied' : 'Copy'}</Btn>
        </div>

        <Callout>
          <Icon name="shield" size={16} color="var(--accent)" />
          <span>We can’t reset this for you. There’s no “forgot password” — that’s the point.</span>
        </Callout>

        <div style={{ flex: 1 }} />
        <Btn kind="primary" size="lg" full icon="arrowR" onClick={() => { setRevealed(true); setView('confirm'); }} style={{ marginTop: 16 }}>I’ve written it down</Btn>
      </div>,
      { top: true },
    );
  }

  // ─────────────── CONFIRM ───────────────
  if (view === 'confirm') {
    return wrap(
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <BackRow onClick={() => setView('create')} step="Step 2 of 2" />
        <h2 style={hStyle(desk)}>Confirm a few words</h2>
        <p style={pStyle}>Just to be sure it’s saved. Tap the correct word for each position.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 20 }}>
          {quizIdx.map((i) => (
            <div key={i}>
              <div style={{ fontFamily: 'var(--ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8 }}>
                Word <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent-ink)' }}>#{i + 1}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {options(i).map((opt) => {
                  const sel = picks[i] === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => setPicks((p) => ({ ...p, [i]: opt }))}
                      style={{
                        fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 500, padding: '11px 12px', borderRadius: 11, cursor: 'pointer',
                        textAlign: 'left', transition: 'all .12s',
                        background: sel ? 'var(--accent-soft)' : 'var(--surface)',
                        border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--line)'}`,
                        color: sel ? 'var(--accent-ink)' : 'var(--ink)',
                      }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <Btn
          kind={allCorrect ? 'primary' : 'ghost'}
          size="lg"
          full
          icon={allCorrect ? 'check' : undefined}
          onClick={() => allCorrect && onEnter()}
          style={{ marginTop: 18, opacity: allCorrect ? 1 : 0.55, pointerEvents: allCorrect ? 'auto' : 'none' }}
        >
          {allCorrect ? 'Open my journal' : 'Select all three words'}
        </Btn>
      </div>,
      { top: true },
    );
  }

  // ─────────────── RESTORE ───────────────
  if (view === 'restore') {
    return wrap(
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <BackRow onClick={() => setView('welcome')} step="Restore" />
        <h2 style={hStyle(desk)}>Enter your phrase</h2>
        <p style={pStyle}>Type the twelve words from any device where this journal already lives. Order matters.</p>

        <div style={{ display: 'grid', gridTemplateColumns: desk ? 'repeat(3,1fr)' : 'repeat(2,1fr)', gap: 8, marginTop: 18 }}>
          {restoreWords.map((w, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 11px', borderRadius: 10, height: 42, background: 'var(--surface)', border: `1px solid ${w ? 'var(--accent)' : 'var(--line)'}` }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{String(i + 1).padStart(2, '0')}</span>
              <input
                value={w}
                placeholder="·····"
                onInput={(e) => setRestoreWords((a) => a.map((x, j) => (j === i ? (e.target as HTMLInputElement).value : x)))}
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--mono)', fontSize: 13.5, color: 'var(--ink)' }}
              />
            </div>
          ))}
        </div>

        <button
          onClick={() => setRestoreWords([...MNEMONIC])}
          style={{ alignSelf: 'flex-start', marginTop: 12, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--accent-ink)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Icon name="copy" size={14} /> Paste from clipboard
        </button>

        <Callout>
          <Icon name="lock" size={16} color="var(--accent)" />
          <span>Your phrase is never sent anywhere. It only unlocks the encrypted data already on the server.</span>
        </Callout>

        <div style={{ flex: 1 }} />
        <Btn
          kind={restoreFilled === 12 ? 'primary' : 'ghost'}
          size="lg"
          full
          onClick={() => restoreFilled === 12 && onEnter()}
          style={{ marginTop: 16, opacity: restoreFilled === 12 ? 1 : 0.55, pointerEvents: restoreFilled === 12 ? 'auto' : 'none' }}
        >
          {restoreFilled === 12 ? 'Restore journal' : `${restoreFilled} / 12 words`}
        </Btn>
      </div>,
      { top: true },
    );
  }

  // ─────────────── UNLOCK (returning device) ───────────────
  const dots = 4;
  return wrap(
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', margin: 'auto 0', width: '100%' }}>
      <Wordmark size={24} />
      <div style={{ marginTop: 40, marginBottom: 6, color: 'var(--ink-2)' }}>
        <div style={{ width: 76, height: 76, borderRadius: 999, border: '1.5px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
          <Icon name="lock" size={30} color="var(--accent)" />
        </div>
      </div>
      <h2 style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--ink)', margin: '18px 0 4px', fontWeight: 500 }}>Welcome back</h2>
      <p style={{ fontFamily: 'var(--ui)', fontSize: 13.5, color: 'var(--ink-3)', margin: 0 }}>Enter your passcode or use Face ID</p>

      <div style={{ display: 'flex', gap: 14, margin: '26px 0 22px' }}>
        {Array.from({ length: dots }).map((_, i) => (
          <div key={i} style={{ width: 14, height: 14, borderRadius: 999, background: i < pin.length ? 'var(--accent)' : 'transparent', border: `1.5px solid ${i < pin.length ? 'var(--accent)' : 'var(--line)'}`, transition: 'all .15s' }} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 64px)', gap: 14, justifyContent: 'center' }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <KeypadKey key={n} onClick={() => setPin((p) => (p.length < dots ? p + n : p))}>{n}</KeypadKey>
        ))}
        <KeypadKey faint onClick={() => onEnter()}><Icon name="eye" size={22} color="var(--ink-2)" /></KeypadKey>
        <KeypadKey onClick={() => setPin((p) => (p.length < dots ? p + '0' : p))}>0</KeypadKey>
        <KeypadKey faint onClick={() => setPin((p) => p.slice(0, -1))}><Icon name="left" size={22} color="var(--ink-2)" /></KeypadKey>
      </div>

      <button
        onClick={() => onEnter()}
        style={{ marginTop: 26, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-ink)', fontFamily: 'var(--ui)', fontSize: 14, fontWeight: 600 }}
      >
        <Icon name="shield" size={18} color="var(--accent-ink)" /> Unlock with Face ID
      </button>
    </div>,
  );
}

// ── small parts ─────────────────────────────────────────────
function KeypadKey({ children, onClick, faint }: { children: ComponentChildren; onClick: () => void; faint?: boolean }): VNode {
  return (
    <button
      onClick={onClick}
      style={{
        width: 64, height: 64, borderRadius: 999, cursor: 'pointer',
        background: faint ? 'transparent' : 'var(--surface)',
        border: faint ? 'none' : '1px solid var(--line)',
        fontFamily: 'var(--ui)', fontSize: 24, fontWeight: 500, color: 'var(--ink)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .12s',
      }}
      onMouseDown={(e) => (e.currentTarget.style.background = 'var(--accent-soft)')}
      onMouseUp={(e) => (e.currentTarget.style.background = faint ? 'transparent' : 'var(--surface)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = faint ? 'transparent' : 'var(--surface)')}
    >
      {children}
    </button>
  );
}

function BackRow({ onClick, step }: { onClick: () => void; step?: string }): VNode {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
      <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-2)', fontFamily: 'var(--ui)', fontSize: 14, fontWeight: 600, marginLeft: -6 }}>
        <Icon name="left" size={20} /> Back
      </button>
      {step && <span style={{ fontFamily: 'var(--ui)', fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', letterSpacing: 0.4 }}>{step}</span>}
    </div>
  );
}

function Callout({ children }: { children: ComponentChildren }): VNode {
  return (
    <div
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, padding: '12px 14px', borderRadius: 12,
        background: 'var(--accent-soft)', border: '1px solid var(--accent-line)',
        fontFamily: 'var(--ui)', fontSize: 12.5, lineHeight: 1.5, color: 'var(--accent-ink)',
      }}
    >
      {children}
    </div>
  );
}
