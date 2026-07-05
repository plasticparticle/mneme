// Device-unlock sheet (Preferences → Vault): switch the at-rest seal between
// a passphrase, a WebAuthn security key, and off — while unlocked, without
// re-entering the mnemonic (state/data.tsx holds the seed in memory). The
// previous seal stays in place until the new one succeeds, so a cancelled
// security-key ceremony changes nothing.
import type { JSX, VNode } from 'preact';
import { useState } from 'preact/hooks';
import { Icon, type IconName } from './Icon';
import { Btn } from './primitives';
import { PassField } from '../screens/Onboarding';
import { webauthnAvailable, PrfUnsupportedError } from '../platform/webauthn';
import type { DeviceUnlockChoice } from '../state/data';

const pStyle: JSX.CSSProperties = { fontFamily: 'var(--ui)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 };

const noManager = { autocomplete: 'off', 'data-1p-ignore': true, 'data-lpignore': 'true' } as const;

const LABEL: Record<'passphrase' | 'securityKey' | 'off', string> = {
  passphrase: 'Passphrase',
  securityKey: 'Security key',
  off: 'Off — ask for my phrase each time',
};

export function DeviceUnlockSheet({ desk, onClose, method, apply }: {
  desk: boolean;
  onClose: () => void;
  /** The seal currently on this device; null → nothing persists. */
  method: 'passphrase' | 'securityKey' | null;
  /** state/data.tsx setDeviceUnlock — rejects when the switch didn't happen. */
  apply: (choice: DeviceUnlockChoice) => Promise<void>;
}): VNode {
  const current = method ?? 'off';
  // 'passphrase' expands the fields below instead of applying immediately.
  const [picked, setPicked] = useState<'passphrase' | null>(null);
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const minLen = 8;
  const passValid = pass1.length >= minLen && pass1 === pass2;
  const mismatch = pass2.length > 0 && pass1 !== pass2;

  const run = (choice: DeviceUnlockChoice): void => {
    if (busy) return;
    setBusy(true);
    setError('');
    setDone('');
    apply(choice)
      .then(() => {
        setBusy(false);
        setPicked(null);
        setPass1('');
        setPass2('');
        setDone(
          choice.method === 'off'
            ? 'Nothing stays on this device now — cold starts ask for your twelve words.'
            : choice.method === 'securityKey'
              ? 'Done — this device now unlocks with your security key.'
              : 'Done — this device now unlocks with your passphrase.',
        );
      })
      .catch((err: unknown) => {
        setBusy(false);
        setError(
          err instanceof PrfUnsupportedError
            ? 'This key doesn’t support the required PRF extension — use a passphrase instead.'
            : choice.method === 'securityKey'
              ? 'Security key setup didn’t complete — nothing was changed.'
              : 'That didn’t work — nothing was changed.',
        );
      });
  };

  const Option = ({ icon, kind, note, onClick, active }: {
    icon: IconName;
    kind: 'passphrase' | 'securityKey' | 'off';
    note: string;
    onClick: () => void;
    active: boolean;
  }): VNode => (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', textAlign: 'left',
        cursor: busy ? 'default' : 'pointer', padding: '12px 14px', borderRadius: 12,
        border: `1.5px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
        background: active ? 'var(--accent-soft)' : 'var(--paper)',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <Icon name={icon} size={17} color={active ? 'var(--accent)' : 'var(--ink-2)'} style={{ marginTop: 1 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: 'var(--ui)', fontSize: 13.5, fontWeight: 600, color: active ? 'var(--accent-ink)' : 'var(--ink)' }}>
          {LABEL[kind]}
          {current === kind && <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 500, color: 'var(--ink-3)', marginLeft: 8 }}>current</span>}
        </span>
        <span style={{ display: 'block', fontFamily: 'var(--ui)', fontSize: 12, lineHeight: 1.5, color: 'var(--ink-3)', marginTop: 2 }}>{note}</span>
      </span>
    </button>
  );

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
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 500, color: 'var(--ink)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="key" size={18} color="var(--accent)" /> Device unlock
        </h3>
        <p style={pStyle}>
          How this device stores your key at rest. Whatever you pick only guards the copy here — the
          twelve-word recovery phrase always signs you in and is the only way to recover the journal.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {webauthnAvailable() && (
            <Option
              icon="key"
              kind="securityKey"
              note="Unlock with a FIDO2 security key or platform passkey (touch/biometric prompt). Enrolls the key now."
              active={picked === null && current === 'securityKey'}
              onClick={() => run({ method: 'securityKey' })}
            />
          )}
          <Option
            icon="lock"
            kind="passphrase"
            note="Unlock by typing a device passphrase. Guessable offline by anyone holding the device — pick something long."
            active={picked === 'passphrase' || (picked === null && current === 'passphrase')}
            onClick={() => setPicked('passphrase')}
          />
          {picked === 'passphrase' && (
            <form
              onSubmit={(e) => { e.preventDefault(); if (passValid) run({ method: 'passphrase', passphrase: pass1 }); }}
              style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '2px 2px 0' }}
            >
              <PassField value={pass1} placeholder={`Passphrase (at least ${minLen} characters)`} onInput={setPass1} disabled={busy} noManager={noManager} autoFocus />
              <PassField value={pass2} placeholder="Repeat the passphrase" onInput={setPass2} disabled={busy} noManager={noManager} />
              {mismatch && <p style={{ fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--accent-ink)', margin: '0 2px' }}>The two passphrases don’t match yet.</p>}
              <Btn kind={passValid ? 'primary' : 'ghost'} size="md" full type="submit" style={{ opacity: passValid && !busy ? 1 : 0.55, pointerEvents: passValid && !busy ? 'auto' : 'none' }}>
                {busy ? 'Encrypting…' : 'Set passphrase'}
              </Btn>
            </form>
          )}
          <Option
            icon="shield"
            kind="off"
            note="Store nothing. Every cold start asks for the full recovery phrase — the strictest setting."
            active={picked === null && current === 'off'}
            onClick={() => run({ method: 'off' })}
          />
        </div>

        {error && <p style={{ fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--accent-ink)', margin: '12px 2px 0' }}>{error}</p>}
        {done && (
          <p style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontFamily: 'var(--ui)', fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)', margin: '12px 2px 0' }}>
            <Icon name="check" size={15} color="var(--accent)" style={{ marginTop: 1 }} /> {done}
          </p>
        )}

        <Btn kind="ghost" size="md" full onClick={onClose} style={{ marginTop: 16 }}>Close</Btn>
      </div>
    </div>
  );
}
