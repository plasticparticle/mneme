import type { VNode } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Editor } from '@tiptap/core';
import { Icon } from '../ui/Icon';
import { SyncBadge, Cover, ConnChip } from '../ui/primitives';
import { LabelField } from '../ui/LabelField';
import { findJournal, LABELS } from '../data/sample';
import { useAppData } from '../state/data';
import type { JournalEntry, MediaAttachment } from '../sync/engine';
import { useRichEditor } from '../editor/useRichEditor';
import { insertMediaAttachment } from '../editor/media';
import { EditorToolbar } from '../editor/Toolbar';
import { parseBody } from '../editor/doc';
import { buildSlashCommands, createSlashHandle } from '../editor/slash';
import { SlashMenu } from '../editor/SlashMenu';
import { VideoCapture } from '../ui/VideoCapture';
import { AudioCapture } from '../ui/AudioCapture';
import { AttachmentList } from '../ui/Attachments';
import { EntryDateTime } from '../ui/EntryDateTime';
import '../editor/editor.css';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SAVE_DEBOUNCE_MS = 600;

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

// ── The editable entry surface: title + TipTap body, autosaving to the relay ──
function EntryEditor({
  entry,
  desk,
  onEditorReady,
  onWords,
}: {
  entry: JournalEntry;
  desk: boolean;
  onEditorReady: (e: Editor | null) => void;
  onWords: (n: number) => void;
}): VNode {
  const { entries, updateEntry, addMedia, removeMedia, mediaBlob } = useAppData();
  const [capturing, setCapturing] = useState<'video' | 'audio' | null>(null);
  // Computed once per mount; this component is keyed by entry.id so a different
  // entry remounts it with fresh initial content.
  const initial = useMemo(() => parseBody(entry.bodyJson, entry.bodyText), [entry.id]);

  const title = useRef(entry.title);
  const body = useRef<{ json: string; text: string }>({ json: entry.bodyJson ?? '', text: entry.bodyText });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Local "typed but not yet committed" flag — drives the save indicator the instant
  // you edit, before the debounce hands off to the global outbox.
  const [dirty, setDirty] = useState(false);

  const save = (): void => {
    setDirty(false);
    updateEntry(entry.id, { title: title.current, bodyJson: body.current.json, bodyText: body.current.text });
  };
  const scheduleSave = (): void => {
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, SAVE_DEBOUNCE_MS);
  };

  // Stable for the lifetime of this mount (the editor mounts once; keyed by entry.id).
  const slashHandle = useMemo(createSlashHandle, []);
  const slashCommands = useMemo(
    () => buildSlashCommands({ onVideo: () => setCapturing('video'), onAudio: () => setCapturing('audio') }),
    [],
  );

  // Stable per mount (keyed by entry.id): how inline media nodes get their
  // bytes and how a confirmed delete purges them.
  const mediaHandlers = useMemo(
    () => ({
      resolve: (att: MediaAttachment) => mediaBlob(entry.id, att),
      onRemoved: (att: MediaAttachment) => removeMedia(att.id),
    }),
    [],
  );

  const { editor, mountRef } = useRichEditor({
    initial,
    placeholder: 'Begin where you are…',
    slash: { handle: slashHandle, commands: slashCommands },
    media: mediaHandlers,
    onChange: (c) => {
      body.current = c;
      onWords(countWords(c.text));
      scheduleSave();
    },
  });

  // Store the recording, then embed it in the document at the cursor; the
  // entry update rides the normal autosave of the changed document.
  const attach = async (kind: MediaAttachment['kind'], blob: Blob, durationMs: number): Promise<void> => {
    const att = await addMedia(entry.id, kind, blob, durationMs);
    if (att && editor) insertMediaAttachment(editor, att);
  };

  useEffect(() => {
    onEditorReady(editor);
    onWords(countWords(body.current.text));
  }, [editor]);

  // Flush any pending save on unmount (e.g. switching entries or leaving).
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        save();
      }
    },
    [],
  );

  const journal = findJournal(entry.journalId);
  // Grow the title textarea to fit its wrapped content (single-line inputs can't wrap).
  const fitTitle = (el: HTMLTextAreaElement): void => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  const onTitleInput = (ev: Event): void => {
    const el = ev.target as HTMLTextAreaElement;
    title.current = el.value;
    fitTitle(el);
    scheduleSave();
  };

  // Autocomplete candidates: every label already used across the journal plus
  // the predefined palette, most-used first. Labels live inside entry bodies —
  // there is no separate label registry to query.
  const labelSuggestions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (e.deleted) continue;
      for (const l of e.labels) counts.set(l, (counts.get(l) ?? 0) + 1);
    }
    for (const id of Object.keys(LABELS)) if (!counts.has(id)) counts.set(id, 0);
    return [...counts.keys()].sort(
      (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b),
    );
  }, [entries]);

  return (
    <div>
      <LabelField
        labels={entry.labels}
        suggestions={labelSuggestions}
        onChange={(labels) => updateEntry(entry.id, { labels })}
      />

      <textarea
        ref={(el) => { if (el) fitTitle(el); }}
        defaultValue={entry.title}
        onInput={onTitleInput}
        placeholder="Untitled"
        rows={1}
        style={{
          width: '100%', border: 'none', outline: 'none', background: 'transparent',
          fontFamily: 'var(--editor-font)', fontSize: desk ? 38 : 30, fontWeight: 600,
          color: 'var(--ink)', lineHeight: 1.15, letterSpacing: 0.2, padding: 0, margin: 0,
          resize: 'none', overflow: 'hidden', display: 'block',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', margin: '10px 0 16px', color: 'var(--ink-3)' }}>
        <EntryDateTime value={entry.createdAt} desk={desk} onChange={(ts) => updateEntry(entry.id, { createdAt: ts })} />
        {journal && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 9, background: journal.color }} />
            <span style={{ fontFamily: 'var(--ui)', fontSize: 13 }}>{journal.name}</span>
          </span>
        )}
        <SyncBadge dirty={dirty} />
      </div>

      <div ref={mountRef} />
      <SlashMenu handle={slashHandle} />

      {/* Legacy attachments only (pre-inline entries); new recordings are inline nodes. */}
      <AttachmentList entry={entry} />

      {capturing === 'video' && (
        <VideoCapture
          desk={desk}
          onClose={() => setCapturing(null)}
          onCapture={(blob, durationMs) => void attach('video', blob, durationMs)}
        />
      )}
      {capturing === 'audio' && (
        <AudioCapture
          desk={desk}
          onClose={() => setCapturing(null)}
          onCapture={(blob, durationMs) => void attach('audio', blob, durationMs)}
        />
      )}
    </div>
  );
}

export function EditorScreen({
  desk,
  entryId,
  onBack,
  onSelectEntry,
  onNew,
}: {
  desk: boolean;
  entryId: string | null;
  onBack: () => void;
  onSelectEntry: (id: string) => void;
  onNew: () => void;
}): VNode {
  const { entries } = useAppData();
  const entry = entries.find((e) => e.id === entryId) ?? null;
  const [editor, setEditor] = useState<Editor | null>(null);
  const [words, setWords] = useState(0);
  const journal = entry ? findJournal(entry.journalId) : undefined;

  const empty = (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'var(--ink-3)' }}>
      <Icon name="feather" size={30} color="var(--ink-3)" />
      <span style={{ fontFamily: 'var(--ui)', fontSize: 14 }}>Nothing open yet.</span>
      <button onClick={onNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--accent-ink)', fontFamily: 'var(--ui)', fontSize: 13.5, fontWeight: 600 }}>
        <Icon name="plus" size={16} color="var(--accent-ink)" /> New entry
      </button>
    </div>
  );

  if (desk) {
    const list = [...entries].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
    return (
      <div style={{ height: '100%', display: 'flex', background: 'var(--paper)' }}>
        {/* entry list */}
        <div style={{ width: 312, borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'var(--surface-2)' }}>
          <div style={{ padding: '22px 18px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {journal && <Cover journal={journal} w={26} h={34} r={6} />}
              <div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 500, color: 'var(--ink)' }}>{journal?.name ?? 'Write'}</div>
                <div style={{ fontFamily: 'var(--ui)', fontSize: 11.5, color: 'var(--ink-3)' }}>{entries.length} entries</div>
              </div>
            </div>
            <button title="New entry" onClick={onNew} style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="plus" size={18} color="var(--accent-ink)" /></button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {list.map((x) => {
              const j = findJournal(x.journalId);
              const active = x.id === entryId;
              const d = new Date(x.createdAt);
              return (
                <button key={x.id} onClick={() => onSelectEntry(x.id)} style={{ textAlign: 'left', cursor: 'pointer', padding: '12px 13px', borderRadius: 12, border: 'none', background: active ? 'var(--surface)' : 'transparent', borderLeft: `2.5px solid ${active ? j?.color ?? 'transparent' : 'transparent'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--serif)', fontSize: 15.5, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.title || 'Untitled'}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', flexShrink: 0 }}>{MON[d.getMonth()]} {d.getDate()}</span>
                  </div>
                  <p style={{ fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--ink-2)', margin: '3px 0 0', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{x.bodyText}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid var(--line)' }}>
            <EditorToolbar editor={editor} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--ink-3)' }}>{words} words</span>
              <SyncBadge />
              <button style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="more" size={18} color="var(--ink-2)" /></button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {entry ? (
              <div style={{ maxWidth: 660, margin: '0 auto', padding: '40px 32px 80px' }}>
                <EntryEditor key={entry.id} entry={entry} desk onEditorReady={setEditor} onWords={setWords} />
              </div>
            ) : (
              empty
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── mobile ──
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--paper)', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(env(safe-area-inset-top, 0px) + 16px) 14px 10px', flexShrink: 0 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-ink)', fontFamily: 'var(--ui)', fontSize: 15, fontWeight: 600 }}>
          <Icon name="left" size={22} color="var(--accent-ink)" />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <span style={{ width: 8, height: 8, borderRadius: 9, background: journal?.color }} />
            <span style={{ fontFamily: 'var(--ui)', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{journal?.name ?? 'Write'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ConnChip compact />
          <button title="New entry" onClick={onNew} style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}><Icon name="plus" size={20} color="var(--accent-ink)" /></button>
          <button style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}><Icon name="more" size={20} color="var(--ink-2)" /></button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {entry ? (
          <div style={{ padding: '6px 22px 120px' }}>
            <EntryEditor key={entry.id} entry={entry} desk={false} onEditorReady={setEditor} onWords={setWords} />
          </div>
        ) : (
          empty
        )}
      </div>

      {/* floating format toolbar */}
      {entry && (
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 30, display: 'flex', justifyContent: 'center' }}>
          <EditorToolbar editor={editor} floating />
        </div>
      )}
    </div>
  );
}
