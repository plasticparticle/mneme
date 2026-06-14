// Import-from-Day-One sheet. The user picks the JSON export .zip; we parse it
// locally (nothing is uploaded), show a summary, then create encrypted entries +
// media through the normal app surface. Day One journals become Mneme notebooks.
//
// All work is local and client-side: the zip never leaves the device, and each
// imported entry/media file is encrypted on the way into the vault exactly like
// hand-authored content.
import type { JSX, VNode } from 'preact';
import { useState } from 'preact/hooks';
import { Icon } from './Icon';
import { Btn } from './primitives';
import { useAppData } from '../state/data';
import { parseDayOneArchive, type DayOneArchive } from '../import/dayone';
import { importDayOne, type ImportProgress, type ImportSummary } from '../import/run';

type Step = 'pick' | 'ready' | 'working' | 'done' | 'error';

const pStyle: JSX.CSSProperties = { fontFamily: 'var(--ui)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 };

export function ImportDayOneSheet({ desk, onClose }: { desk: boolean; onClose: () => void }): VNode {
  const { journals, newJournal, createEntry, updateEntry, addMedia } = useAppData();
  const [step, setStep] = useState<Step>('pick');
  const [archive, setArchive] = useState<DayOneArchive | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const busy = step === 'working';

  const onFile = async (file: File): Promise<void> => {
    setError('');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = parseDayOneArchive(bytes);
      setArchive(parsed);
      setStep('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('error');
    }
  };

  const run = async (): Promise<void> => {
    if (!archive) return;
    setStep('working');
    setProgress({ done: 0, total: archive.entryCount, current: '' });
    try {
      const result = await importDayOne(archive, { journals, newJournal, createEntry, updateEntry, addMedia }, setProgress);
      setSummary(result);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('error');
    }
  };

  const body = ((): VNode => {
    if (step === 'working') {
      const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '6px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <Icon name="download" size={26} color="var(--accent)" />
            <div style={{ fontFamily: 'var(--ui)', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Importing your journal…</div>
            <p style={{ ...pStyle, fontSize: 12.5, textAlign: 'center' }}>
              {progress?.current ? `Writing “${progress.current}”` : 'Encrypting entries and media on this device.'}
            </p>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--paper)', border: '1px solid var(--line)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width .2s' }} />
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-3)', textAlign: 'center' }}>
            {progress?.done ?? 0} / {progress?.total ?? 0} entries
          </div>
        </div>
      );
    }

    if (step === 'done' && summary) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={26} color="var(--accent)" />
            <div style={{ fontFamily: 'var(--ui)', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Import complete</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--ui)', fontSize: 13, color: 'var(--ink-2)' }}>
            <SummaryRow label="Entries imported" value={summary.entries} />
            <SummaryRow label="Notebooks created" value={summary.journals} />
            <SummaryRow label="Media files attached" value={summary.media} />
            {summary.skippedMedia > 0 && <SummaryRow label="Media missing from export" value={summary.skippedMedia} muted />}
          </div>
          <p style={{ ...pStyle, fontSize: 12.5 }}>
            Everything is encrypted and syncing now. New notebooks appear on the Journals screen.
          </p>
          <Btn kind="primary" size="md" onClick={onClose}>Done</Btn>
        </div>
      );
    }

    if (step === 'error') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={pStyle}>The import couldn’t finish — <strong style={{ color: 'var(--ink)' }}>nothing was changed by the failed step</strong>.</p>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-2)', padding: '10px 12px', borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)', overflowWrap: 'anywhere' }}>{error}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn kind="ghost" size="md" onClick={onClose} style={{ flex: 1 }}>Close</Btn>
            <Btn kind="primary" size="md" onClick={() => { setStep('pick'); setArchive(null); setError(''); }} style={{ flex: 2 }}>Pick another file</Btn>
          </div>
        </div>
      );
    }

    if (step === 'ready' && archive) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={pStyle}>Ready to import from your Day One export:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--ui)', fontSize: 13, color: 'var(--ink-2)' }}>
            <SummaryRow label="Notebooks" value={archive.journals.length} />
            <SummaryRow label="Entries" value={archive.entryCount} />
            <SummaryRow label="Media files" value={archive.mediaCount} />
          </div>
          <p style={{ ...pStyle, fontSize: 12.5 }}>
            Existing notebooks with a matching name are reused; the rest are created. This can take a moment for large
            journals — everything is encrypted on this device.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn kind="ghost" size="md" onClick={() => { setStep('pick'); setArchive(null); }} style={{ flex: 1 }}>Back</Btn>
            <Btn kind="primary" size="md" onClick={() => void run()} style={{ flex: 2 }}>Import {archive.entryCount} entries</Btn>
          </div>
        </div>
      );
    }

    // pick
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={pStyle}>
          In Day One, choose <strong style={{ color: 'var(--ink)' }}>Settings → Import/Export → Export → JSON</strong>,
          then pick the <strong style={{ color: 'var(--ink)' }}>.zip</strong> it produces. It’s read entirely on this
          device — nothing is uploaded.
        </p>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer?.files?.[0];
            if (f) void onFile(f);
          }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '28px 18px', borderRadius: 14,
            border: `1.5px dashed ${dragOver ? 'var(--accent)' : 'var(--line)'}`, background: dragOver ? 'var(--accent-soft)' : 'var(--paper)',
            cursor: 'pointer', textAlign: 'center',
          }}
        >
          <Icon name="download" size={24} color="var(--accent)" />
          <span style={{ fontFamily: 'var(--ui)', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Choose or drop your Day One .zip</span>
          <span style={{ fontFamily: 'var(--ui)', fontSize: 12, color: 'var(--ink-3)' }}>JSON export only</span>
          <input
            type="file"
            accept=".zip,application/zip"
            style={{ display: 'none' }}
            onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void onFile(f); }}
          />
        </label>
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
          <Icon name="download" size={18} color="var(--accent)" /> Import from Day One
        </h3>
        {body}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, muted }: { label: string; value: number; muted?: boolean }): VNode {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '7px 12px', borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)' }}>
      <span style={{ color: muted ? 'var(--ink-3)' : 'var(--ink-2)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: muted ? 'var(--ink-3)' : 'var(--ink)' }}>{value}</span>
    </div>
  );
}
