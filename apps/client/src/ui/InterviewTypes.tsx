// Interview-types manager: list every guided-interview type (built-in seeds and
// user-created alike — built-ins are ordinary records the user may rewrite or
// delete) and edit them. A type is just a name, a one-line intro, and a prompt
// (the question strategy the AI follows), so this is plain text fields — no rich
// editor like the template manager. Mirrors ui/Templates.tsx structurally.
import type { JSX, VNode } from 'preact';
import { useState } from 'preact/hooks';
import { Icon } from './Icon';
import { Btn } from './primitives';
import { useAppData } from '../state/data';
import type { InterviewType } from '../sync/engine';

const UI_13 = { fontFamily: 'var(--ui)', fontSize: 13 } as const;
const labelStyle: JSX.CSSProperties = { fontFamily: 'var(--ui)', fontSize: 11.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--ink-3)', display: 'block', marginBottom: 5 };
const fieldStyle: JSX.CSSProperties = { width: '100%', boxSizing: 'border-box', fontFamily: 'var(--ui)', fontSize: 14, color: 'var(--ink)', padding: '10px 12px', borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)', outline: 'none' };

const handle = (fn: () => void) => (e: Event) => {
  e.stopPropagation();
  fn();
};

function BuiltinChip(): VNode {
  return <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>built-in</span>;
}

function EditorView({ type, onDone }: { type: InterviewType | null; onDone: () => void }): VNode {
  const { createInterviewType, updateInterviewType } = useAppData();
  const [name, setName] = useState(type?.name ?? '');
  const [intro, setIntro] = useState(type?.intro ?? '');
  const [prompt, setPrompt] = useState(type?.prompt ?? '');

  const save = (): void => {
    const input = { name: name.trim() || 'Untitled interview', intro: intro.trim(), prompt: prompt.trim() };
    if (type) updateInterviewType(type.id, input);
    else createInterviewType(input);
    onDone();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}>Name</label>
        <input autoFocus={!type} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="e.g. Evening reflection" style={fieldStyle} />
      </div>
      <div>
        <label style={labelStyle}>Intro</label>
        <input value={intro} onInput={(e) => setIntro((e.target as HTMLInputElement).value)} placeholder="One line shown in the picker" style={fieldStyle} />
      </div>
      <div>
        <label style={labelStyle}>Prompt — what the interview covers</label>
        <textarea
          value={prompt}
          rows={6}
          onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
          placeholder="Describe the themes to cover and the tone. The AI already asks one question at a time and writes the entry up afterward — this just steers what it asks about."
          style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5, minHeight: 120 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Btn kind="ghost" size="md" onClick={onDone} style={{ flex: 1 }}>Cancel</Btn>
        <Btn kind="primary" size="md" onClick={save} style={{ flex: 2 }}>{type ? 'Save interview' : 'Create interview'}</Btn>
      </div>
    </div>
  );
}

export function InterviewTypesSheet({ desk, onClose }: { desk: boolean; onClose: () => void }): VNode {
  const { interviewTypes, deleteInterviewType } = useAppData();
  const [view, setView] = useState<'list' | 'new' | InterviewType>('list');
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const alive = interviewTypes.filter((t) => !t.deleted);

  const newButton = (
    <button
      onClick={() => { setArmedDelete(null); setView('new'); }}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 0', borderRadius: 12, border: '1.5px dashed var(--line)', background: 'transparent', cursor: 'pointer', color: 'var(--ink-3)', fontFamily: 'var(--ui)', fontSize: 13.5, fontWeight: 600 }}
    >
      <Icon name="plus" size={16} /> New interview
    </button>
  );

  const row = (t: InterviewType): VNode => {
    const armed = armedDelete === t.id;
    return (
      <div key={t.id} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--paper)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontFamily: 'var(--serif)', fontSize: 15.5, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name || 'Untitled'}</span>
            {t.builtin && <BuiltinChip />}
          </div>
          {t.intro && <div style={{ ...UI_13, fontSize: 12, color: 'var(--ink-3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.intro}</div>}
        </div>
        {armed ? (
          <button onClick={handle(() => { deleteInterviewType(t.id); setArmedDelete(null); })} style={{ ...UI_13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', flexShrink: 0 }}>
            Delete?
          </button>
        ) : (
          <>
            <button title="Edit" aria-label="Edit" onClick={handle(() => { setArmedDelete(null); setView(t); })} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <Icon name="feather" size={15} color="var(--ink-2)" />
            </button>
            <button title="Delete" aria-label="Delete" onClick={handle(() => setArmedDelete(t.id))} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <Icon name="x" size={15} color="var(--ink-2)" />
            </button>
          </>
        )}
      </div>
    );
  };

  const listBody = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ maxHeight: desk ? '54vh' : '62vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9, overscrollBehavior: 'contain' }}>
        {alive.length === 0 ? (
          <div style={{ ...UI_13, color: 'var(--ink-3)', textAlign: 'center', padding: '22px 0' }}>No interview types yet — create one below.</div>
        ) : (
          alive.map(row)
        )}
      </div>
      {newButton}
    </div>
  );

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(30,22,16,.34)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: desk ? 'center' : 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => { e.stopPropagation(); setArmedDelete(null); }}
        style={{ width: desk ? 560 : '100%', boxSizing: 'border-box', background: 'var(--surface)', borderRadius: desk ? 20 : '24px 24px 0 0', border: '1px solid var(--line)', padding: desk ? 26 : '20px 22px calc(env(safe-area-inset-bottom, 0px) + 30px)', boxShadow: '0 20px 60px rgba(30,20,12,.3)' }}
      >
        {!desk && <div style={{ width: 38, height: 4, borderRadius: 9, background: 'var(--line)', margin: '0 auto 16px' }} />}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 16px' }}>
          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
            {view === 'list' ? 'Interview types' : view === 'new' ? 'New interview' : 'Edit interview'}
          </h3>
          {view !== 'list' && (
            <button onClick={() => setView('list')} title="Back to list" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--ui)', fontSize: 12.5 }}>
              <Icon name="left" size={15} /> All types
            </button>
          )}
        </div>
        {view === 'list' ? listBody : <EditorView key={view === 'new' ? 'new' : view.id} type={view === 'new' ? null : view} onDone={() => setView('list')} />}
      </div>
    </div>
  );
}
