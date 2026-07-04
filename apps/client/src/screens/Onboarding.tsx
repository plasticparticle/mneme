import type { JSX, VNode, ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Icon } from '../ui/Icon';
import { Btn } from '../ui/primitives';
import { Wordmark } from '../ui/Wordmark';
import { generateMnemonic, mnemonicWords, validateMnemonic, wordsToMnemonic } from '../crypto/mnemonic';
import { webauthnAvailable, PrfUnsupportedError } from '../platform/webauthn';
import type { SealChoice } from '../state/data';

type View = 'welcome' | 'create' | 'confirm' | 'restore' | 'passphrase' | 'unlock';

// Visually hidden but NOT display:none/visibility:hidden, so password-manager
// extensions still see and fill it. 1×1 px + opacity keeps it past their
// viewability heuristics; clip/clip-path would risk failing them.
const managerOnly: JSX.CSSProperties = {
  position: 'absolute', left: 0, top: 0, width: 1, height: 1,
  padding: 0, border: 'none', margin: 0, opacity: 0, pointerEvents: 'none',
  fontSize: 16, // prevent iOS zoom-on-focus if it ever receives focus
};

// A username/password pair for password managers only — the *save* side: lets a
// manager capture the phrase when the surrounding form is submitted. The password
// value is the space-separated 12-word phrase. The *fill* side cannot be hidden:
// managers only offer to fill a field the user can actually click, so the restore
// view renders its own visible current-password field instead of this component.
// Also used by the replace-phrase flow (ui/RotatePhrase.tsx) so managers offer to
// update the entry.
export function ManagerCredential({ phrase }: { phrase: string }): VNode {
  return (
    <div aria-hidden="true">
      <input
        type="text"
        name="username"
        autocomplete="username"
        value="mneme journal"
        readOnly
        tabIndex={-1}
        style={managerOnly}
      />
      <input
        type="password"
        name="password"
        autocomplete="new-password"
        value={phrase}
        readOnly
        tabIndex={-1}
        style={managerOnly}
      />
    </div>
  );
}

const hStyle = (desk: boolean): JSX.CSSProperties => ({
  fontFamily: 'var(--serif)', fontWeight: 500, fontSize: desk ? 30 : 26, color: 'var(--ink)', margin: '0 0 6px', letterSpacing: 0.2,
});
const pStyle: JSX.CSSProperties = { fontFamily: 'var(--ui)', fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 };

export function Onboarding({ desk, hasVault, unlockMethod, onEnter, onUnlock, onUnlockWithKey }: {
  desk: boolean;
  /** True when a sealed seed exists on this device → start on unlock. */
  hasVault: boolean;
  /** Which factor seals the seed — drives what the unlock view asks for. */
  unlockMethod: 'passphrase' | 'securityKey' | null;
  /** With a `seal` choice the seed is sealed at rest; without, nothing persists.
   * Rejects when the security-key enrollment fails — the view shows it inline. */
  onEnter: (mnemonic: string, seal?: SealChoice) => Promise<void>;
  /** Rejects on a wrong passphrase — the unlock view shows the error inline. */
  onUnlock: (passphrase: string) => Promise<void>;
  /** Runs the WebAuthn ceremony; rejects on cancel / absent key / wrong key. */
  onUnlockWithKey: () => Promise<void>;
}): VNode {
  const [view, setView] = useState<View>(hasVault ? 'unlock' : 'welcome');
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  // A real, freshly generated recovery phrase for this onboarding session.
  const [mnemonic] = useState(() => generateMnemonic());
  const words = mnemonicWords(mnemonic);

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
  // Raw text of the visible manager-fill field. Kept as its own state rather than
  // derived from the grid: a join(' ')/tokenize round-trip would swallow the
  // trailing space while someone types a phrase directly into that field.
  const [phraseField, setPhraseField] = useState('');
  const restoreFilled = restoreWords.filter((w) => w.trim()).length;
  const restoreMnemonic = wordsToMnemonic(restoreWords);
  const restoreValid = restoreFilled === 12 && validateMnemonic(restoreMnemonic);

  // Split arbitrary pasted text into mnemonic tokens (whitespace/comma separated, lowercased).
  const tokenize = (text: string): string[] => text.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);

  // Grid edits go through here so the manager-fill field mirrors the grid as one
  // space-separated phrase (managers capture it from there on submit).
  const updateWords = (next: string[]): void => {
    setRestoreWords(next);
    setPhraseField(next.map((w) => w.trim()).filter(Boolean).join(' '));
  };

  // Drop `tokens` into the fields starting at `startIdx`. A multi-word paste fills onward
  // from that position (so pasting a full phrase into field 01 populates all twelve); a
  // single token only touches the field it was dropped into.
  const fillFrom = (startIdx: number, tokens: string[]): void => {
    if (tokens.length === 0) return;
    const next = [...restoreWords];
    for (let k = 0; k < tokens.length && startIdx + k < next.length; k++) next[startIdx + k] = tokens[k];
    updateWords(next);
  };

  const pasteFromClipboard = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText();
      fillFrom(0, tokenize(text));
    } catch {
      /* clipboard unavailable */
    }
  };

  // An edit in the manager-fill field (autofill or typing) replaces the whole grid.
  const syncFromPhrase = (text: string): void => {
    setPhraseField(text);
    const tokens = tokenize(text);
    setRestoreWords(Array.from({ length: 12 }, (_, k) => tokens[k] ?? ''));
  };

  // passphrase step (after create/restore): the phrase that view will hand to
  // onEnter, where it came from (for Back), and the optional device passphrase.
  const [pendingMnemonic, setPendingMnemonic] = useState('');
  const [setupReturn, setSetupReturn] = useState<View>('confirm');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [setupError, setSetupError] = useState('');

  // unlock step (returning device with a sealed seed)
  const [unlockPass, setUnlockPass] = useState('');
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState('');

  // Both fields deliberately opt out of password managers: the saved credential
  // for this app is the recovery phrase ("mneme journal"), and a manager
  // offering or capturing the device passphrase here would corrupt that entry.
  const noManager = { autocomplete: 'off', 'data-1p-ignore': true, 'data-lpignore': 'true' } as const;

  const goToPassphrase = (mnemonicToEnter: string, from: View): void => {
    setPendingMnemonic(mnemonicToEnter);
    setSetupReturn(from);
    setView('passphrase');
  };

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
      <form
        onSubmit={(e) => { e.preventDefault(); setRevealed(true); setView('confirm'); }}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}
      >
        <ManagerCredential phrase={mnemonic} />
        <BackRow onClick={() => setView('welcome')} step="Step 1 of 3" />
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
              type="button"
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
          <Btn kind="ghost" size="sm" icon="copy" onClick={async () => { try { await navigator.clipboard.writeText(words.join(' ')); } catch { /* clipboard unavailable */ } setCopied(true); setTimeout(() => setCopied(false), 1400); }}>{copied ? 'Copied' : 'Copy'}</Btn>
        </div>

        <Callout>
          <Icon name="shield" size={16} color="var(--accent)" />
          <span>We can’t reset this for you. There’s no “forgot password” — that’s the point.</span>
        </Callout>

        <div style={{ flex: 1 }} />
        <Btn kind="primary" size="lg" full icon="arrowR" type="submit" style={{ marginTop: 16 }}>I’ve written it down</Btn>
      </form>,
      { top: true },
    );
  }

  // ─────────────── CONFIRM ───────────────
  if (view === 'confirm') {
    return wrap(
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <BackRow onClick={() => setView('create')} step="Step 2 of 3" />
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
          onClick={() => allCorrect && goToPassphrase(mnemonic, 'confirm')}
          style={{ marginTop: 18, opacity: allCorrect ? 1 : 0.55, pointerEvents: allCorrect ? 'auto' : 'none' }}
        >
          {allCorrect ? 'Continue' : 'Select all three words'}
        </Btn>
      </div>,
      { top: true },
    );
  }

  // ─────────────── RESTORE ───────────────
  if (view === 'restore') {
    return wrap(
      <form
        onSubmit={(e) => { e.preventDefault(); if (restoreValid) goToPassphrase(restoreMnemonic, 'restore'); }}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}
      >
        {/* Account context for password managers; the visible phrase field below is their fill target. */}
        <input type="text" name="username" autocomplete="username" value="mneme journal" readOnly tabIndex={-1} aria-hidden="true" style={managerOnly} />
        {/* Back returns to unlock when this device has a sealed seed (that's where the user came from). */}
        <BackRow onClick={() => setView(hasVault ? 'unlock' : 'welcome')} step="Restore" />
        <h2 style={{ ...hStyle(desk), flexShrink: 0 }}>Enter your phrase</h2>
        <p style={{ ...pStyle, flexShrink: 0 }}>Type the twelve words from any device where this journal already lives. Order matters.</p>

        {/* Visible so password managers offer the saved phrase on click; filling it spreads the words into the grid. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '0 12px', height: 42, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--line)', flexShrink: 0 }}>
          <Icon name="lock" size={15} color="var(--ink-3)" />
          <input
            type="password"
            name="password"
            autocomplete="current-password"
            value={phraseField}
            placeholder="Fill the whole phrase from your password manager"
            onInput={(e) => syncFromPhrase((e.target as HTMLInputElement).value)}
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--mono)', fontSize: 13.5, color: 'var(--ink)' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 180px))', gap: 8, marginTop: 12, flex: 1, minHeight: 0, overflowY: 'auto', alignContent: 'start', justifyContent: 'center' }}>
          {restoreWords.map((w, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 11px', borderRadius: 10, height: 42, background: 'var(--surface)', border: `1px solid ${w ? 'var(--accent)' : 'var(--line)'}` }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{String(i + 1).padStart(2, '0')}</span>
              <input
                value={w}
                placeholder="·····"
                size={1}
                autocomplete="off"
                data-1p-ignore
                data-lpignore="true"
                onInput={(e) => updateWords(restoreWords.map((x, j) => (j === i ? (e.target as HTMLInputElement).value : x)))}
                onPaste={(e) => {
                  const tokens = tokenize(e.clipboardData?.getData('text') ?? '');
                  // A multi-word paste spreads across the fields; let a single word fall
                  // through to the default input handling.
                  if (tokens.length > 1) {
                    e.preventDefault();
                    fillFrom(i, tokens);
                  }
                }}
                style={{ flex: 1, width: '100%', minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--mono)', fontSize: 13.5, color: 'var(--ink)' }}
              />
            </div>
          ))}
        </div>

        <div style={{ flexShrink: 0 }}>
          <button
            type="button"
            onClick={pasteFromClipboard}
            style={{ alignSelf: 'flex-start', marginTop: 12, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--accent-ink)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="copy" size={14} /> Paste from clipboard
          </button>

          <Callout>
            <Icon name="lock" size={16} color="var(--accent)" />
            <span>Your phrase is never sent anywhere. It only unlocks the encrypted data already on the server.</span>
          </Callout>

          <Btn
            kind={restoreValid ? 'primary' : 'ghost'}
            size="lg"
            full
            type="submit"
            style={{ marginTop: 16, opacity: restoreValid ? 1 : 0.55, pointerEvents: restoreValid ? 'auto' : 'none' }}
          >
            {restoreFilled < 12 ? `${restoreFilled} / 12 words` : restoreValid ? 'Continue' : 'Phrase not valid'}
          </Btn>
        </div>
      </form>,
      { top: true },
    );
  }

  // ─────────────── PASSPHRASE (optional at-rest seal) ───────────────
  if (view === 'passphrase') {
    const minLen = 8;
    const valid = pass1.length >= minLen && pass1 === pass2;
    const mismatch = pass2.length > 0 && pass1 !== pass2;
    // Shared tail of the three ways out of this view: run the sign-in, surface
    // a failure inline (a cancelled/unsupported security-key ceremony rejects
    // before any state changes, so staying on the view is safe).
    const enter = (seal?: SealChoice): void => {
      if (busy) return;
      setBusy(true);
      setSetupError('');
      onEnter(pendingMnemonic, seal).catch((err: unknown) => {
        setBusy(false);
        setSetupError(
          err instanceof PrfUnsupportedError
            ? 'This key doesn’t support the required PRF extension — use a passphrase instead.'
            : seal?.method === 'securityKey'
              ? 'Security key setup didn’t complete — try again or use a passphrase.'
              : 'Something went wrong — try again.',
        );
      });
    };
    return wrap(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) enter({ method: 'passphrase', passphrase: pass1 });
        }}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        <BackRow onClick={() => !busy && setView(setupReturn)} step={setupReturn === 'confirm' ? 'Step 3 of 3' : 'Last step'} />
        <h2 style={hStyle(desk)}>Stay signed in on this device?</h2>
        <p style={pStyle}>
          Set a passphrase and your key stays here, encrypted, so opening the app only asks for the passphrase. Skip it and nothing is stored — you’ll enter your twelve words on every cold start.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
          <PassField value={pass1} placeholder={`Passphrase (at least ${minLen} characters)`} onInput={setPass1} disabled={busy} noManager={noManager} />
          <PassField value={pass2} placeholder="Repeat the passphrase" onInput={setPass2} disabled={busy} noManager={noManager} />
        </div>
        {mismatch && (
          <p style={{ fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--accent-ink)', margin: '8px 2px 0' }}>The two passphrases don’t match yet.</p>
        )}
        {setupError && (
          <p style={{ fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--accent-ink)', margin: '8px 2px 0' }}>{setupError}</p>
        )}

        <Callout>
          <Icon name="shield" size={16} color="var(--accent)" />
          <span>
            The passphrase only guards the copy on this device — it can’t recover your journal and it isn’t your recovery phrase. Anyone with this device gets as many guesses as they like, so pick something long.
          </span>
        </Callout>

        <div style={{ flex: 1 }} />
        <Btn
          kind={valid ? 'primary' : 'ghost'}
          size="lg"
          full
          type="submit"
          style={{ marginTop: 16, opacity: valid && !busy ? 1 : 0.55, pointerEvents: valid && !busy ? 'auto' : 'none' }}
        >
          {busy ? 'Encrypting…' : 'Encrypt & stay signed in'}
        </Btn>
        {webauthnAvailable() && (
          <Btn kind="ghost" size="lg" full icon="key" onClick={() => enter({ method: 'securityKey' })} style={{ marginTop: 10, opacity: busy ? 0.55 : 1, pointerEvents: busy ? 'none' : 'auto' }}>
            Use a security key instead
          </Btn>
        )}
        <Btn kind="ghost" size="lg" full onClick={() => enter()} style={{ marginTop: 10, opacity: busy ? 0.55 : 1, pointerEvents: busy ? 'none' : 'auto' }}>
          Skip — ask for my phrase each time
        </Btn>
      </form>,
      { top: true },
    );
  }

  // ─────────────── UNLOCK (returning device with a sealed seed) ───────────────
  const keyUnlock = unlockMethod === 'securityKey';
  const unlockWithKey = (): void => {
    if (unlockBusy) return;
    setUnlockBusy(true);
    setUnlockError('');
    // One message for every failure mode — cancelled ceremony, absent key, or
    // the wrong key (AEAD tag mismatch). The phrase link below is the way out.
    onUnlockWithKey().catch(() => {
      setUnlockBusy(false);
      setUnlockError('That security key didn’t unlock this device.');
    });
  };
  return wrap(
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (keyUnlock || unlockBusy || unlockPass.length === 0) return;
        setUnlockBusy(true);
        setUnlockError('');
        onUnlock(unlockPass).catch(() => {
          setUnlockBusy(false);
          setUnlockPass('');
          setUnlockError('That passphrase didn’t unlock this device.');
        });
      }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', margin: 'auto 0', width: '100%' }}
    >
      <Wordmark size={24} />
      <div style={{ marginTop: 40, marginBottom: 6, color: 'var(--ink-2)' }}>
        <div style={{ width: 76, height: 76, borderRadius: 999, border: '1.5px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
          <Icon name={keyUnlock ? 'key' : 'lock'} size={30} color="var(--accent)" />
        </div>
      </div>
      <h2 style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--ink)', margin: '18px 0 4px', fontWeight: 500 }}>Welcome back</h2>
      <p style={{ fontFamily: 'var(--ui)', fontSize: 13.5, color: 'var(--ink-3)', margin: 0 }}>
        {keyUnlock ? 'Unlock this device with your security key' : 'Enter the passphrase for this device'}
      </p>

      <div style={{ width: '100%', maxWidth: 340, marginTop: 26 }}>
        {!keyUnlock && <PassField value={unlockPass} placeholder="Passphrase" onInput={setUnlockPass} disabled={unlockBusy} noManager={noManager} autoFocus />}
        {unlockError && (
          <p style={{ fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--accent-ink)', margin: '10px 2px 0' }}>{unlockError}</p>
        )}
        {keyUnlock ? (
          <Btn
            kind="primary"
            size="lg"
            full
            icon="key"
            onClick={unlockWithKey}
            style={{ marginTop: 14, opacity: unlockBusy ? 0.55 : 1, pointerEvents: unlockBusy ? 'none' : 'auto' }}
          >
            {unlockBusy ? 'Waiting for your key…' : 'Unlock with security key'}
          </Btn>
        ) : (
          <Btn
            kind="primary"
            size="lg"
            full
            type="submit"
            style={{ marginTop: 14, opacity: unlockBusy || unlockPass.length === 0 ? 0.55 : 1, pointerEvents: unlockBusy || unlockPass.length === 0 ? 'none' : 'auto' }}
          >
            {unlockBusy ? 'Unlocking…' : 'Unlock'}
          </Btn>
        )}
      </div>

      <button
        type="button"
        onClick={() => setView('restore')}
        style={{ marginTop: 26, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-ink)', fontFamily: 'var(--ui)', fontSize: 14, fontWeight: 600 }}
      >
        <Icon name="shield" size={18} color="var(--accent-ink)" /> Use my recovery phrase instead
      </button>
    </form>,
  );
}

// ── small parts ─────────────────────────────────────────────
// A passphrase input in the restore-field style. `noManager` keeps password
// managers away from it (the device passphrase must not overwrite the saved
// recovery-phrase credential). Also used by the Preferences device-unlock sheet.
export function PassField({ value, placeholder, onInput, disabled, noManager, autoFocus }: {
  value: string;
  placeholder: string;
  onInput: (v: string) => void;
  disabled?: boolean;
  noManager: Record<string, unknown>;
  autoFocus?: boolean;
}): VNode {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 44, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <Icon name="lock" size={15} color="var(--ink-3)" />
      <input
        type="password"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        onInput={(e) => onInput((e.target as HTMLInputElement).value)}
        {...noManager}
        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--ink)' }}
      />
    </div>
  );
}

function BackRow({ onClick, step }: { onClick: () => void; step?: string }): VNode {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
      <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-2)', fontFamily: 'var(--ui)', fontSize: 14, fontWeight: 600, marginLeft: -6 }}>
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
