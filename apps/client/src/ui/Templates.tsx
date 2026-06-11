// Template manager: a sheet listing every entry template (built-in seeds and
// user-created alike — built-ins are ordinary records the user may rewrite or
// delete), with a small rich editor for creating and editing template bodies.
// "Use" hands the template to the caller, which starts a new entry from it.
import type { VNode } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon';
import { Btn } from './primitives';
import { useAppData } from '../state/data';
import type { TemplateRecord } from '../sync/engine';
import { useRichEditor } from '../editor/useRichEditor';
import { parseBody } from '../editor/doc';
import '../editor/editor.css';

const UI_13 = { fontFamily: 'var(--ui)', fontSize: 13 } as const;

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

function TemplateRow({
  t,
  armed,
  onUse,
  onEdit,
  onDelete,
}: {
  t: TemplateRecord;
  armed: boolean; // delete was clicked once; next click commits
  onUse: () => void;
  onEdit: () => void;
  onDelete: () => void;
}): VNode {
  // stopPropagation: the sheet container disarms the delete confirmation on any
  // click that bubbles up to it — row actions must not count as "clicked away".
  const handle = (fn: () => void) => (e: Event) => {
    e.stopPropagation();
    fn();
  };
  const iconBtn = (title: string, name: 'feather' | 'x', onClick: () => void, color?: string): VNode => (
    <button
      title={title}
      onClick={handle(onClick)}
      style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
    >
      <Icon name={name} size={15} color={color ?? 'var(--ink-2)'} />
    </button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--paper)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontFamily: 'var(--serif)', fontSize: 15.5, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {t.name || 'Untitled template'}
          </span>
          {t.builtin && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>built-in</span>
          )}
        </div>
        <div style={{ ...UI_13, fontSize: 12, color: 'var(--ink-3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.bodyText.replace(/\n+/g, ' · ') || 'Empty template'}
        </div>
      </div>
      {armed ? (
        <button
          onClick={handle(onDelete)}
          style={{ ...UI_13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', flexShrink: 0 }}
        >
          Delete?
        </button>
      ) : (
        <>
          <button
            onClick={handle(onUse)}
            style={{ ...UI_13, fontWeight: 600, color: 'var(--accent-ink)', background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 8, padding: '5px 11px', cursor: 'pointer', flexShrink: 0 }}
          >
            Use
          </button>
          {iconBtn('Edit template', 'feather', onEdit)}
          {iconBtn('Delete template', 'x', onDelete)}
        </>
      )}
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
  const alive = templates.filter((t) => !t.deleted);

  const body =
    view === 'list' ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ maxHeight: '52vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {alive.map((t) => (
            <TemplateRow
              key={t.id}
              t={t}
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
          ))}
          {alive.length === 0 && (
            <div style={{ ...UI_13, color: 'var(--ink-3)', textAlign: 'center', padding: '22px 0' }}>
              No templates yet — create one below.
            </div>
          )}
        </div>
        <button
          onClick={() => { setArmedDelete(null); setView('new'); }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 0', borderRadius: 12, border: '1.5px dashed var(--line)', background: 'transparent', cursor: 'pointer', color: 'var(--ink-3)', fontFamily: 'var(--ui)', fontSize: 13.5, fontWeight: 600 }}
        >
          <Icon name="plus" size={16} /> New template
        </button>
      </div>
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
        style={{ width: desk ? 520 : '100%', boxSizing: 'border-box', background: 'var(--surface)', borderRadius: desk ? 20 : '24px 24px 0 0', border: '1px solid var(--line)', padding: desk ? 26 : '20px 22px 30px', boxShadow: '0 20px 60px rgba(30,20,12,.3)' }}
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
