// Delete-journal sheet — removes one notebook and everything written in it.
// Same heavy friction as deleting the vault: the user must type the word
// "delete". The entries tombstone through the LWW oplog (so the deletion
// reaches other devices) and their recordings are purged locally and on the
// relay; the journal row itself is a local grouping and disappears immediately.
import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import { t, tp } from '../i18n';
import { Icon } from './Icon';
import { Btn } from './primitives';
import type { Journal } from '../data/sample';

// Renders a catalog message around one styled placeholder: the raw template
// (t() without params keeps `{token}` literal) is split on the token and the
// given node is interleaved — no concatenation of translated fragments.
function around(key: Parameters<typeof t>[0], token: string, node: VNode | string): (VNode | string)[] {
  const [before, ...rest] = t(key).split(`{${token}}`);
  return rest.length > 0 ? [before, node, rest.join(`{${token}}`)] : [before];
}

export function DeleteJournalSheet({ desk, journal, onClose, onDelete }: {
  desk: boolean;
  /** The notebook to delete — `count` carries its live entry count for the warning copy. */
  journal: Journal;
  onClose: () => void;
  /** Performs the deletion (local + queued relay deletes); the caller closes the sheet. */
  onDelete: () => void;
}): VNode {
  const [typed, setTyped] = useState('');
  // The typed word comes from the catalog too — the check is purely
  // client-side, so localizing it is safe. Case-insensitive on purpose.
  const word = t('journals.delete.word');
  const armed = typed.trim().toLowerCase() === word.toLowerCase();

  const what =
    journal.count === 0
      ? t('journals.delete.empty')
      : tp('journals.delete.body', journal.count);

  return (
    <div
      onClick={onClose}
      style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(30,22,16,.34)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: desk ? 'center' : 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: desk ? 440 : '100%', boxSizing: 'border-box', background: 'var(--surface)', borderRadius: desk ? 20 : '24px 24px 0 0', border: '1px solid var(--line)', padding: desk ? 26 : '20px 22px 30px', boxShadow: '0 20px 60px rgba(30,20,12,.3)', maxHeight: '90%', overflowY: 'auto' }}
      >
        {!desk && <div style={{ width: 38, height: 4, borderRadius: 9, background: 'var(--line)', margin: '0 auto 16px' }} />}
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 500, color: 'var(--ink)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="trash" size={18} color="var(--accent)" /> {t('journals.delete.title')}
        </h3>
        <form onSubmit={(e) => { e.preventDefault(); if (armed) onDelete(); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontFamily: 'var(--ui)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 }}>
            {around('journals.delete.lead', 'name', <strong style={{ color: 'var(--ink)' }}>{journal.name}</strong>)} {what} {t('journals.delete.noUndo')}
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ fontFamily: 'var(--ui)', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
              {around('journals.delete.confirmLabel', 'word', <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent-ink)' }}>{word}</span>)}
            </span>
            <input
              autoFocus
              value={typed}
              onInput={(e) => setTyped((e.target as HTMLInputElement).value)}
              placeholder={word}
              autocomplete="off"
              spellcheck={false}
              style={{ fontFamily: 'var(--mono)', fontSize: 14, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${armed ? 'var(--accent)' : 'var(--line)'}`, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', width: '100%' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
            <Btn kind="ghost" size="md" onClick={onClose} style={{ flex: 1 }}>{t('common.cancel')}</Btn>
            <Btn kind={armed ? 'primary' : 'ghost'} size="md" type="submit" style={{ flex: 2, opacity: armed ? 1 : 0.55, pointerEvents: armed ? 'auto' : 'none' }}>
              {armed ? t('journals.delete.confirm') : t('journals.delete.typeFirst', { word })}
            </Btn>
          </div>
        </form>
      </div>
    </div>
  );
}
