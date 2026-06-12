import type { VNode } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Editor, JSONContent } from '@tiptap/core';
import { Icon } from '../ui/Icon';
import { SyncBadge, Cover, ConnChip } from '../ui/primitives';
import { LabelField } from '../ui/LabelField';
import { findJournal, LABELS } from '../data/sample';
import { useAppData } from '../state/data';
import type { JournalEntry, MediaAttachment } from '../sync/engine';
import { useRichEditor } from '../editor/useRichEditor';
import { insertMediaAttachment, insertImageGallery, docImages } from '../editor/media';
import { EditorToolbar } from '../editor/Toolbar';
import { parseBody, docMediaIds } from '../editor/doc';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { buildSlashCommands, createSlashHandle, type SlashCommand } from '../editor/slash';
import { SlashMenu } from '../editor/SlashMenu';
import { VideoCapture } from '../ui/VideoCapture';
import { AudioCapture } from '../ui/AudioCapture';
import { AttachmentList } from '../ui/Attachments';
import { Lightbox } from '../ui/Lightbox';
import { EntryDateTime } from '../ui/EntryDateTime';
import '../editor/editor.css';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SAVE_DEBOUNCE_MS = 600;

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

// Pixel size of an uploaded image, stored in the attachment metadata so layout
// can reserve the right footprint before the bytes resolve.
async function imageSize(blob: Blob): Promise<{ width?: number; height?: number }> {
  try {
    const bmp = await createImageBitmap(blob);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return {}; // unsupported format — the gallery falls back to a default aspect
  }
}

// Route an uploaded file to its attachment kind by mime type.
function uploadKind(file: File): MediaAttachment['kind'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
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
  const { entries, templates, updateEntry, addMedia, removeMedia, mediaBlob } = useAppData();
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

  // Hidden pickers behind the "/" Image and File commands.
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Stable for the lifetime of this mount (the editor mounts once; keyed by entry.id).
  const slashHandle = useMemo(createSlashHandle, []);
  // Commands rebuild when templates change, but the editor reads them through a
  // stable getter — the "/" palette stays current without remounting the editor.
  const slashCommands = useRef<SlashCommand[]>([]);
  slashCommands.current = useMemo(
    () =>
      buildSlashCommands({
        onVideo: () => setCapturing('video'),
        onAudio: () => setCapturing('audio'),
        onImage: () => imageInput.current?.click(),
        onFile: () => fileInput.current?.click(),
        templates,
      }),
    [templates],
  );
  const getSlashCommands = useCallback(() => slashCommands.current, []);

  // Maximized image view: every image of the entry in document order, so ←/→
  // steps through the whole entry. Opened through a ref because the (stable)
  // media handlers are created before the editor instance exists.
  const [lightbox, setLightbox] = useState<{ items: MediaAttachment[]; index: number } | null>(null);
  const openImageRef = useRef<(att: MediaAttachment) => void>(() => undefined);

  // Stable per mount (keyed by entry.id): how inline media nodes get their
  // bytes, how a confirmed delete purges them, and how an image maximizes.
  const mediaHandlers = useMemo(
    () => ({
      resolve: (att: MediaAttachment) => mediaBlob(entry.id, att),
      onRemoved: (att: MediaAttachment) => removeMedia(att.id),
      onOpenImage: (att: MediaAttachment) => openImageRef.current(att),
    }),
    [],
  );

  // The editor instance, reachable from callbacks created before it exists.
  const editorRef = useRef<Editor | null>(null);

  // Store the uploads, then embed them in the document at the cursor; the
  // entry update rides the normal autosave of the changed document. Images
  // picked together land as one gallery; everything else as its own card.
  const uploadFiles = async (files: File[]): Promise<void> => {
    const ed = editorRef.current;
    const images: MediaAttachment[] = [];
    for (const f of files.filter((f) => uploadKind(f) === 'image')) {
      const att = await addMedia(entry.id, 'image', f, { name: f.name, ...(await imageSize(f)) });
      if (att) images.push(att);
    }
    if (images.length && ed) insertImageGallery(ed, images);
    for (const f of files.filter((f) => uploadKind(f) !== 'image')) {
      const att = await addMedia(entry.id, uploadKind(f), f, { name: f.name });
      if (att && ed) insertMediaAttachment(ed, att);
    }
  };

  const { editor, mountRef } = useRichEditor({
    initial,
    placeholder: 'Begin where you are…',
    slash: { handle: slashHandle, commands: getSlashCommands },
    media: mediaHandlers,
    onFiles: (files) => void uploadFiles(files),
    onChange: (c) => {
      body.current = c;
      onWords(countWords(c.text));
      scheduleSave();
    },
  });
  editorRef.current = editor;
  openImageRef.current = (att) => {
    const items = editor ? docImages(editor.getJSON()) : [];
    const index = items.findIndex((i) => i.id === att.id);
    setLightbox(index >= 0 ? { items, index } : { items: [att], index: 0 });
  };

  // Store the recording, then embed it in the document at the cursor.
  const attach = async (kind: MediaAttachment['kind'], blob: Blob, durationMs: number): Promise<void> => {
    const att = await addMedia(entry.id, kind, blob, { durationMs });
    if (att && editor) insertMediaAttachment(editor, att);
  };

  // Pickers re-fire change even for the same selection (value reset below).
  const onPicked = (ev: Event): void => {
    const el = ev.target as HTMLInputElement;
    const files = Array.from(el.files ?? []);
    el.value = '';
    if (files.length) void uploadFiles(files);
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

      {/* Hidden pickers for the "/" Image and File commands. */}
      <input ref={imageInput} type="file" accept="image/*" multiple onChange={onPicked} style={{ display: 'none' }} />
      <input ref={fileInput} type="file" multiple onChange={onPicked} style={{ display: 'none' }} />

      {lightbox && (
        <Lightbox
          items={lightbox.items}
          index={lightbox.index}
          resolve={(att) => mediaBlob(entry.id, att)}
          onNavigate={(index) => setLightbox((cur) => (cur ? { ...cur, index } : cur))}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

// ⋯ menu in the editor header — holds the destructive entry actions. Deleting
// tombstones the entry (syncs to every device) and removes its recordings from
// this device and the relay, so it always confirms first.
function EntryMenu({ desk, entry, onDeleted }: { desk: boolean; entry: JournalEntry | null; onDeleted: () => void }): VNode {
  const { deleteEntry } = useAppData();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // How many recordings the deletion takes with it (inline nodes + legacy list).
  const mediaCount = useMemo(() => {
    if (!entry) return 0;
    const ids = new Set((entry.attachments ?? []).map((a) => a.id));
    if (entry.bodyJson) {
      try {
        for (const m of docMediaIds(JSON.parse(entry.bodyJson) as JSONContent)) ids.add(m);
      } catch {
        /* unparseable body — count the legacy list only */
      }
    }
    return ids.size;
  }, [entry]);

  const btnStyle = desk
    ? { width: 34, height: 34, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: entry ? 'pointer' : 'default', opacity: entry ? 1 : 0.5 }
    : { width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: entry ? 'pointer' : 'default', opacity: entry ? 1 : 0.5 };

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button title="Entry actions" disabled={!entry} onClick={() => setOpen((o) => !o)} style={btnStyle}>
        <Icon name="more" size={desk ? 18 : 20} color="var(--ink-2)" />
      </button>
      {open && entry && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 65 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 66, minWidth: 180, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 10px 30px rgba(30,20,12,.18)', padding: 5 }}>
            <button
              onClick={() => {
                setOpen(false);
                setConfirming(true);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 11px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--ui)', fontSize: 13.5, fontWeight: 600, color: '#E4573D' }}
            >
              <Icon name="trash" size={15} color="#E4573D" /> Delete entry…
            </button>
          </div>
        </>
      )}
      {confirming && entry && (
        <ConfirmDialog
          title="Delete this entry?"
          confirmLabel="Delete entry"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            deleteEntry(entry.id);
            onDeleted();
          }}
        >
          <strong style={{ color: 'var(--ink)' }}>“{entry.title || 'Untitled'}”</strong> will be removed from all your
          devices
          {mediaCount > 0
            ? `, and its ${mediaCount === 1 ? 'media file' : `${mediaCount} media files`} will be deleted from this device and the sync server`
            : ''}
          . <strong style={{ color: 'var(--ink)' }}>This cannot be undone.</strong>
        </ConfirmDialog>
      )}
    </span>
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
  onNew: (journalId?: string) => void;
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
      <button onClick={() => onNew()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--accent-ink)', fontFamily: 'var(--ui)', fontSize: 13.5, fontWeight: 600 }}>
        <Icon name="plus" size={16} color="var(--accent-ink)" /> New entry
      </button>
    </div>
  );

  if (desk) {
    // The entry list is scoped to the open entry's journal; without one open
    // (nothing selected yet) it falls back to the whole vault.
    const scoped = entry ? entries.filter((x) => x.journalId === entry.journalId) : entries;
    const list = [...scoped].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
    return (
      <div style={{ height: '100%', display: 'flex', background: 'var(--paper)' }}>
        {/* entry list */}
        <div style={{ width: 312, borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'var(--surface-2)' }}>
          <div style={{ padding: '22px 18px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {journal && <Cover journal={journal} w={26} h={34} r={6} />}
              <div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 500, color: 'var(--ink)' }}>{journal?.name ?? 'Write'}</div>
                <div style={{ fontFamily: 'var(--ui)', fontSize: 11.5, color: 'var(--ink-3)' }}>{scoped.length} {scoped.length === 1 ? 'entry' : 'entries'}</div>
              </div>
            </div>
            <button title="New entry" onClick={() => onNew(entry?.journalId)} style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="plus" size={18} color="var(--accent-ink)" /></button>
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
              <EntryMenu desk entry={entry} onDeleted={() => undefined} />
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
          <button title="New entry" onClick={() => onNew(entry?.journalId)} style={{ width: 36, height: 36, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}><Icon name="plus" size={20} color="var(--accent-ink)" /></button>
          <EntryMenu desk={false} entry={entry} onDeleted={onBack} />
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
