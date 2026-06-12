// Delete-vault sheet — the permanent exit. Wipes the account from the relay and
// erases this device (plaintext DB + at-rest seal), then lands on onboarding.
// Deliberately heavy friction: the user must type the word "delete" — a
// matching server-side check guards the relay endpoint too, so neither a stray
// tap nor a stray request can destroy a vault.
import type { JSX, VNode } from 'preact';
import { useState } from 'preact/hooks';
import { Icon } from './Icon';
import { Btn } from './primitives';

type Step = 'confirm' | 'working' | 'error';

const pStyle: JSX.CSSProperties = { fontFamily: 'var(--ui)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 };

export function DeleteVaultSheet({ desk, onClose, deleteVault }: {
  desk: boolean;
  onClose: () => void;
  /** Performs the wipe; on success the app returns to onboarding (this sheet unmounts). */
  deleteVault: () => Promise<void>;
}): VNode {
  const [step, setStep] = useState<Step>('confirm');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const armed = typed.trim() === 'delete';

  const run = async (): Promise<void> => {
    if (!armed) return;
    setStep('working');
    setError('');
    try {
      await deleteVault();
      // Success unmounts the whole unlocked UI (status → locked) — nothing to render here.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('error');
    }
  };

  const busy = step === 'working';

  const body = ((): VNode => {
    if (step === 'working') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '12px 0' }}>
          <Icon name="trash" size={26} color="var(--accent)" />
          <div style={{ fontFamily: 'var(--ui)', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Deleting your vault…</div>
          <p style={{ ...pStyle, fontSize: 12.5, textAlign: 'center' }}>
            Removing everything from the server, then erasing this device.
          </p>
        </div>
      );
    }

    if (step === 'error') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={pStyle}>
            The vault could not be deleted — <strong style={{ color: 'var(--ink)' }}>nothing was removed</strong>.
            Deletion needs a live connection to the server; check it and try again.
          </p>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-2)', padding: '10px 12px', borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)', overflowWrap: 'anywhere' }}>{error}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn kind="ghost" size="md" onClick={onClose} style={{ flex: 1 }}>Close</Btn>
            <Btn kind="primary" size="md" onClick={() => void run()} style={{ flex: 2 }}>Try again</Btn>
          </div>
        </div>
      );
    }

    // confirm
    return (
      <form onSubmit={(e) => { e.preventDefault(); void run(); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={pStyle}>
          This permanently deletes <strong style={{ color: 'var(--ink)' }}>every entry, recording and template</strong> —
          from the server and from this device. There is no undo, no backup, and no one who can restore it for you.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 12, background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', fontFamily: 'var(--ui)', fontSize: 12.5, lineHeight: 1.5, color: 'var(--accent-ink)' }}>
          <Icon name="trash" size={16} color="var(--accent)" />
          <span>
            Your recovery phrase will open an <strong>empty</strong> vault afterwards. Other devices keep what they
            already hold locally until you delete it there too — but they can no longer sync.
          </span>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontFamily: 'var(--ui)', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
            Type <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent-ink)' }}>delete</span> to confirm
          </span>
          <input
            value={typed}
            onInput={(e) => setTyped((e.target as HTMLInputElement).value)}
            placeholder="delete"
            autocomplete="off"
            spellcheck={false}
            style={{ fontFamily: 'var(--mono)', fontSize: 14, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${armed ? 'var(--accent)' : 'var(--line)'}`, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', width: '100%' }}
          />
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
          <Btn kind="ghost" size="md" onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
          <Btn kind={armed ? 'primary' : 'ghost'} size="md" type="submit" style={{ flex: 2, opacity: armed ? 1 : 0.55, pointerEvents: armed ? 'auto' : 'none' }}>
            {armed ? 'Delete vault forever' : 'Type “delete” first'}
          </Btn>
        </div>
      </form>
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
          <Icon name="trash" size={18} color="var(--accent)" /> Delete vault
        </h3>
        {body}
      </div>
    </div>
  );
}
