// Template manager: a sheet listing every entry template (built-in seeds and
// user-created alike — built-ins are ordinary records the user may rewrite or
// delete), with a small rich editor for creating and editing template bodies.
// "Use" hands the template to the caller, which starts a new entry from it.
//
// Layout: on desktop the list view is master/detail — picking a template shows
// a rendered preview (DocPreview, true editor typography) beside the list. On
// mobile each row expands in place to its preview + actions, so the whole flow
// stays inside one bottom sheet with no nested modals.
import type { VNode } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon';
import { Btn } from './primitives';
import { useAppData } from '../state/data';
import type { TemplateRecord } from '../sync/engine';
import { useRichEditor } from '../editor/useRichEditor';
import { parseBody } from '../editor/doc';
import { DocPreview } from '../editor/DocPreview';
import '../editor/editor.css';

const UI_13 = { fontFamily: 'var(--ui)', fontSize: 13 } as const;

// stopPropagation: the sheet container disarms the delete confirmation on any
// click that bubbles up to it — row actions must not count as "clicked away".
const handle = (fn: () => void) => (e: Event) => {
  e.stopPropagation();
  fn();
};

function BuiltinChip(): VNode {
  return (
    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>built-in</span>
  );
}

function TemplateEditorView({
  template,
  onDone,
}: {
  template: TemplateRecord | null; // null → creating a new template
  onDone: () => void;
}): VNode {
  const { createTemplate, updateTemplate } = useAppData();
  const [name, setName] = useState(template?.name ?? '');
  const body = useRef<{ json: string; text: string }>({
    json: template?.bodyJson ?? '',
    text: template?.bodyText ?? '',
  });
  const initial = useMemo(() => parseBody(template?.bodyJson, template?.bodyText ?? ''), []);
  const { mountRef } = useRichEditor({
    initial,
    placeholder: 'Headings, prompts, checklists — the shape an entry starts from…',
    onChange: (c) => {
      body.current = c;
    },
  });

  const save = (): void => {
    const input = { name: name.trim() || 'Untitled template', bodyJson: body.current.json || undefined, bodyText: body.current.text };
    if (template) updateTemplate(template.id, input);
    else createTemplate(input);
    onDone();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <input
          autoFocus={!template}
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          placeholder="Template name"
          style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--ink)', fontWeight: 500 }}
        />
        <div style={{ height: 1, background: 'var(--line)', marginTop: 4 }} />
      </div>
      <div
        ref={mountRef}
        style={{ minHeight: 180, maxHeight: '42vh', overflow: 'auto', padding: '4px 12px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--paper)' }}
      />
      <div style={{ display: 'flex', gap: 10 }}>
        <Btn kind="ghost" size="md" onClick={onDone} style={{ flex: 1 }}>Cancel</Btn>
        <Btn kind="primary" size="md" onClick={save} style={{ flex: 2 }}>
          {template ? 'Save template' : 'Create template'}
        </Btn>
      </div>
    </div>
  );
}

// Use / edit / delete for one template; `compact` renders the desktop pane
// header sizing, otherwise the mobile full-width action bar.
function TemplateActions({
  compact,
  armed,
  onUse,
  onEdit,
  onDelete,
}: {
  compact: boolean;
  armed: boolean; // delete was tapped once; the next tap commits
  onUse: () => void;
  onEdit: () => void;
  onDelete: () => void;
}): VNode {
  const side = compact ? 30 : 40;
  const iconBtn = (title: string, name: 'feather' | 'x', onClick: () => void): VNode => (
    <button
      title={title}
      aria-label={title}
      onClick={handle(onClick)}
      style={{ width: side, height: side, borderRadius: compact ? 8 : 10, border: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
    >
      <Icon name={name} size={compact ? 15 : 17} color="var(--ink-2)" />
    </button>
  );
  if (armed) {
    return (
      <button
        onClick={handle(onDelete)}
        style={{ ...UI_13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: compact ? 8 : 10, padding: compact ? '6px 11px' : '11px 0', cursor: 'pointer', flexShrink: 0, flex: compact ? undefined : 1 }}
      >
        Delete permanently?
      </button>
    );
  }
  return (
    <>
      <button
        onClick={handle(onUse)}
        style={{ ...UI_13, fontSize: compact ? 13 : 14, fontWeight: 600, color: 'var(--accent-ink)', background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: compact ? 8 : 10, padding: compact ? '5px 12px' : '10px 0', cursor: 'pointer', flexShrink: 0, flex: compact ? undefined : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <Icon name="feather" size={compact ? 13 : 15} color="var(--accent-ink)" /> Use
      </button>
      {iconBtn('Edit template', 'feather', onEdit)}
      {iconBtn('Delete template', 'x', onDelete)}
    </>
  );
}

// Scrollable rendered preview, shared by the desktop pane and mobile accordion.
// flex/minHeight let it fill the desktop pane; `maxHeight` caps the accordion.
function PreviewBody({ t, maxHeight }: { t: TemplateRecord; maxHeight?: string }): VNode {
  return (
    <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, maxHeight, padding: '14px 18px 18px', overscrollBehavior: 'contain' }}>
      <DocPreview json={t.bodyJson} text={t.bodyText} />
    </div>
  );
}

export function TemplatesSheet({
  desk,
  onClose,
  onUse,
}: {
  desk: boolean;
  onClose: () => void;
  onUse: (t: TemplateRecord) => void;
}): VNode {
  const { templates, deleteTemplate } = useAppData();
  // 'list' | the template being edited | 'new'
  const [view, setView] = useState<'list' | 'new' | TemplateRecord>('list');
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  // Desktop: which template the preview pane shows (falls back to the first).
  // Mobile: which row is expanded (null → all collapsed).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const alive = templates.filter((t) => !t.deleted);

  const actionsFor = (t: TemplateRecord, compact: boolean): VNode => (
    <TemplateActions
      compact={compact}
      armed={armedDelete === t.id}
      onUse={() => onUse(t)}
      onEdit={() => { setArmedDelete(null); setView(t); }}
      onDelete={() => {
        if (armedDelete === t.id) {
          deleteTemplate(t.id);
          setArmedDelete(null);
        } else {
          setArmedDelete(t.id);
        }
      }}
    />
  );

  const newButton = (
    <button
      onClick={() => { setArmedDelete(null); setView('new'); }}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 0', borderRadius: 12, border: '1.5px dashed var(--line)', background: 'transparent', cursor: 'pointer', color: 'var(--ink-3)', fontFamily: 'var(--ui)', fontSize: 13.5, fontWeight: 600 }}
    >
      <Icon name="plus" size={16} /> New template
    </button>
  );

  const empty = (
    <div style={{ ...UI_13, color: 'var(--ink-3)', textAlign: 'center', padding: '22px 0' }}>
      No templates yet — create one below.
    </div>
  );

  // ── desktop list view: selectable rows + preview pane ──
  const deskList = (): VNode => {
    const sel = alive.find((t) => t.id === selectedId) ?? alive[0];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {alive.length === 0 ? (
          empty
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '218px minmax(0, 1fr)', gap: 12, height: '54vh', minHeight: 320 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', paddingRight: 2 }}>
              {alive.map((t) => {
                const active = t.id === sel?.id;
                return (
                  <button
                    key={t.id}
                    onClick={handle(() => { setArmedDelete(null); setSelectedId(t.id); })}
                    style={{ textAlign: 'left', cursor: 'pointer', padding: '11px 12px', borderRadius: 10, background: active ? 'var(--accent-soft)' : 'var(--paper)', border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`, display: 'flex', flexDirection: 'column', gap: 3 }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <span style={{ fontFamily: 'var(--serif)', fontSize: 14.5, fontWeight: 500, color: active ? 'var(--accent-ink)' : 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.name || 'Untitled template'}
                      </span>
                      {t.builtin && <BuiltinChip />}
                    </span>
                  </button>
                );
              })}
            </div>
            {sel && (
              <div style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--paper)', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 10px 16px', borderBottom: '1px solid var(--line)', background: 'var(--surface-2)' }}>
                  <span style={{ fontFamily: 'var(--serif)', fontSize: 15.5, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {sel.name || 'Untitled template'}
                    {sel.builtin && <BuiltinChip />}
                  </span>
                  {actionsFor(sel, true)}
                </div>
                <PreviewBody t={sel} />
              </div>
            )}
          </div>
        )}
        {newButton}
      </div>
    );
  };

  // ── mobile list view: accordion rows (tap to preview in place) ──
  const mobileList = (): VNode => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ maxHeight: '62vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9, overscrollBehavior: 'contain' }}>
        {alive.length === 0 && empty}
        {alive.map((t) => {
          const open = t.id === selectedId;
          return (
            <div key={t.id} style={{ border: `1px solid ${open ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 14, background: 'var(--paper)', overflow: 'hidden' }}>
              <button
                onClick={handle(() => { setArmedDelete(null); setSelectedId(open ? null : t.id); })}
                aria-expanded={open}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer', padding: '13px 14px', background: 'transparent', border: 'none' }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontFamily: 'var(--serif)', fontSize: 15.5, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.name || 'Untitled template'}
                    </span>
                    {t.builtin && <BuiltinChip />}
                  </span>
                  {!open && (
                    <span style={{ ...UI_13, fontSize: 12, color: 'var(--ink-3)', marginTop: 2, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.bodyText.replace(/\n+/g, ' · ') || 'Empty template'}
                    </span>
                  )}
                </span>
                <Icon name={open ? 'down' : 'right'} size={17} color="var(--ink-3)" />
              </button>
              {open && (
                <>
                  <div style={{ borderTop: '1px solid var(--line)' }}>
                    <PreviewBody t={t} maxHeight="34vh" />
                  </div>
                  <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
                    {actionsFor(t, false)}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {newButton}
    </div>
  );

  const body =
    view === 'list' ? (
      desk ? deskList() : mobileList()
    ) : (
      <TemplateEditorView
        key={view === 'new' ? 'new' : view.id}
        template={view === 'new' ? null : view}
        onDone={() => setView('list')}
      />
    );

  return (
    <div
      onClick={onClose}
      style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(30,22,16,.34)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: desk ? 'center' : 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => { e.stopPropagation(); setArmedDelete(null); }}
        style={{ width: desk && view === 'list' ? 720 : desk ? 520 : '100%', boxSizing: 'border-box', background: 'var(--surface)', borderRadius: desk ? 20 : '24px 24px 0 0', border: '1px solid var(--line)', padding: desk ? 26 : '20px 22px calc(env(safe-area-inset-bottom, 0px) + 30px)', boxShadow: '0 20px 60px rgba(30,20,12,.3)', transition: 'width .15s' }}
      >
        {!desk && <div style={{ width: 38, height: 4, borderRadius: 9, background: 'var(--line)', margin: '0 auto 16px' }} />}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 16px' }}>
          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
            {view === 'list' ? 'Templates' : view === 'new' ? 'New template' : 'Edit template'}
          </h3>
          {view !== 'list' && (
            <button onClick={() => setView('list')} title="Back to list" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--ui)', fontSize: 12.5 }}>
              <Icon name="left" size={15} /> All templates
            </button>
          )}
        </div>
        {body}
      </div>
    </div>
  );
}
