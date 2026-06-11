// Replace-recovery-phrase sheet — the escape hatch for "my twelve words may
// have leaked". Walks the user through generating a fresh phrase, proving they
// saved it (same quiz pattern as onboarding), then runs the actual rotation
// (sync/rotate.ts) with live progress. The old phrase keeps working until the
// final wipe step, so an interrupted rotation loses nothing.
import type { JSX, VNode } from 'preact';
import { useState } from 'preact/hooks';
import { Icon } from './Icon';
import { Btn } from './primitives';
import { generateMnemonic, mnemonicWords } from '../crypto/mnemonic';
import { ManagerCredential } from '../screens/Onboarding';
import type { RotationProgress } from '../sync/rotate';

type Step = 'warn' | 'reveal' | 'confirm' | 'working' | 'done' | 'error';

const PHASE_LABEL: Record<RotationProgress['phase'], string> = {
  pull: 'Collecting your entries…',
  entries: 'Re-encrypting entries…',
  media: 'Re-encrypting recordings…',
  wipe: 'Retiring the old phrase…',
};

const pStyle: JSX.CSSProperties = { fontFamily: 'var(--ui)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 };

export function RotatePhraseSheet({ desk, onClose, rotate }: {
  desk: boolean;
  onClose: () => void;
  /** Runs the migration; resolves once the vault lives under the new phrase. */
  rotate: (newMnemonic: string, onProgress: (p: RotationProgress) => void) => Promise<void>;
}): VNode {
  const [step, setStep] = useState<Step>('warn');
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState<RotationProgress | null>(null);
  const [error, setError] = useState('');
  // Generated once per sheet open; only submitted to rotate() after the quiz.
  const [mnemonic] = useState(() => generateMnemonic());
  const words = mnemonicWords(mnemonic);

  // Confirm quiz (same shape as onboarding): prove three words were written down.
  const quizIdx = [1, 5, 9];
  const [picks, setPicks] = useState<Record<number, string>>({});
  const allCorrect = quizIdx.every((i) => picks[i] === words[i]);
  const decoys = ['lantern', 'meadow', 'cobalt', 'thicket', 'ember', 'harbor', 'walnut', 'prairie', 'quartz'];
  const options = (i: number): string[] => {
    const set = [words[i], decoys[i % decoys.length], decoys[(i + 3) % decoys.length], decoys[(i + 6) % decoys.length]];
    return set.sort((a, b) => (a > b ? 1 : -1));
  };

  const run = async (): Promise<void> => {
    setStep('working');
    setError('');
    try {
      await rotate(mnemonic, setProgress);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('error');
    }
  };

  const busy = step === 'working';

  const body = ((): VNode => {
    if (step === 'warn') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={pStyle}>
            If your twelve words may have been seen by someone else, replace them. Mneme will generate a
            <strong style={{ color: 'var(--ink)' }}> new phrase</strong>, re-encrypt your entire journal under it,
            and permanently retire the current one.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 12, background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', fontFamily: 'var(--ui)', fontSize: 12.5, lineHeight: 1.5, color: 'var(--accent-ink)' }}>
            <Icon name="shield" size={16} color="var(--accent)" />
            <span>
              Afterwards the old phrase unlocks <strong>nothing</strong> — not even encrypted data. Every other
              device will need the new phrase to sign in again.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <Btn kind="ghost" size="md" onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
            <Btn kind="primary" size="md" onClick={() => setStep('reveal')} style={{ flex: 2 }}>Generate new phrase</Btn>
          </div>
        </div>
      );
    }

    if (step === 'reveal') {
      return (
        <form onSubmit={(e) => { e.preventDefault(); setStep('confirm'); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ManagerCredential phrase={mnemonic} />
          <p style={pStyle}>Your new recovery phrase. Write it down in order — it replaces the old one completely.</p>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'grid', gridTemplateColumns: desk ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 7, padding: 12, borderRadius: 14, background: 'var(--paper)', border: '1px solid var(--line)', filter: revealed ? 'none' : 'blur(7px)', transition: 'filter .2s', userSelect: 'none' }}>
              {words.map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 9, background: 'var(--surface)', border: '1px solid var(--line)' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)', width: 16 }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{w}</span>
                </div>
              ))}
            </div>
            {!revealed && (
              <button type="button" onClick={() => setRevealed(true)} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink)' }}>
                <Icon name="eye" size={20} color="var(--ink)" />
                <span style={{ fontFamily: 'var(--ui)', fontWeight: 600, fontSize: 13.5 }}>Tap to reveal</span>
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn kind="ghost" size="sm" icon={revealed ? 'eyeoff' : 'eye'} onClick={() => setRevealed((r) => !r)}>{revealed ? 'Hide' : 'Reveal'}</Btn>
            <Btn kind="ghost" size="sm" icon="copy" onClick={async () => { try { await navigator.clipboard.writeText(mnemonic); } catch { /* clipboard unavailable */ } setCopied(true); setTimeout(() => setCopied(false), 1400); }}>{copied ? 'Copied' : 'Copy'}</Btn>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
            <Btn kind="ghost" size="md" onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
            <Btn kind="primary" size="md" type="submit" style={{ flex: 2 }}>I’ve written it down</Btn>
          </div>
        </form>
      );
    }

    if (step === 'confirm') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={pStyle}>Confirm three words from the <strong style={{ color: 'var(--ink)' }}>new</strong> phrase. After this step the old phrase stops working.</p>
          {quizIdx.map((i) => (
            <div key={i}>
              <div style={{ fontFamily: 'var(--ui)', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 7 }}>
                Word <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent-ink)' }}>#{i + 1}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7 }}>
                {options(i).map((opt) => {
                  const sel = picks[i] === opt;
                  return (
                    <button key={opt} onClick={() => setPicks((p) => ({ ...p, [i]: opt }))} style={{ fontFamily: 'var(--mono)', fontSize: 13.5, fontWeight: 500, padding: '10px 11px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', background: sel ? 'var(--accent-soft)' : 'var(--paper)', border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--line)'}`, color: sel ? 'var(--accent-ink)' : 'var(--ink)' }}>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
            <Btn kind="ghost" size="md" onClick={() => setStep('reveal')} style={{ flex: 1 }}>Back</Btn>
            <Btn kind={allCorrect ? 'primary' : 'ghost'} size="md" onClick={() => allCorrect && void run()} style={{ flex: 2, opacity: allCorrect ? 1 : 0.55, pointerEvents: allCorrect ? 'auto' : 'none' }}>
              {allCorrect ? 'Replace phrase now' : 'Select all three words'}
            </Btn>
          </div>
        </div>
      );
    }

    if (step === 'working') {
      const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '12px 0' }}>
          <Icon name="lock" size={26} color="var(--accent)" />
          <div style={{ fontFamily: 'var(--ui)', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
            {progress ? PHASE_LABEL[progress.phase] : 'Preparing…'}
          </div>
          <div style={{ width: '100%', height: 6, borderRadius: 99, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: 'var(--accent)', transition: 'width .25s' }} />
          </div>
          <p style={{ ...pStyle, fontSize: 12.5, textAlign: 'center' }}>
            Keep this window open. Your journal is being re-encrypted under the new phrase.
          </p>
        </div>
      );
    }

    if (step === 'done') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '10px 0', textAlign: 'center' }}>
          <Icon name="check" size={28} color="var(--accent)" />
          <div style={{ fontFamily: 'var(--ui)', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Phrase replaced</div>
          <p style={pStyle}>
            The old phrase now unlocks nothing. Sign your other devices in again with the
            <strong style={{ color: 'var(--ink)' }}> new twelve words</strong> — and if a password manager stored the
            old phrase, update it there too.
          </p>
          <Btn kind="primary" size="md" full onClick={onClose}>Done</Btn>
        </div>
      );
    }

    // error
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={pStyle}>
          The migration stopped before the old phrase was retired, so <strong style={{ color: 'var(--ink)' }}>nothing
          was lost</strong> — your journal still opens with the current phrase. You can retry with the same new phrase.
        </p>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-2)', padding: '10px 12px', borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)', overflowWrap: 'anywhere' }}>{error}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn kind="ghost" size="md" onClick={onClose} style={{ flex: 1 }}>Close</Btn>
          <Btn kind="primary" size="md" onClick={() => void run()} style={{ flex: 2 }}>Try again</Btn>
        </div>
      </div>
    );
  })();

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(30,22,16,.34)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: desk ? 'center' : 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: desk ? 460 : '100%', boxSizing: 'border-box', background: 'var(--surface)', borderRadius: desk ? 20 : '24px 24px 0 0', border: '1px solid var(--line)', padding: desk ? 26 : '20px 22px 30px', boxShadow: '0 20px 60px rgba(30,20,12,.3)', maxHeight: '90%', overflowY: 'auto' }}
      >
        {!desk && <div style={{ width: 38, height: 4, borderRadius: 9, background: 'var(--line)', margin: '0 auto 16px' }} />}
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 500, color: 'var(--ink)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="shield" size={18} color="var(--accent)" /> Replace recovery phrase
        </h3>
        {body}
      </div>
    </div>
  );
}
