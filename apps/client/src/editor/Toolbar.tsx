import type { VNode } from 'preact';
import { Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Editor } from '@tiptap/core';
import { t, type MessageKey } from '../i18n';
import { Icon, type IconName } from '../ui/Icon';

interface Tool {
  icon: IconName;
  label: MessageKey; // resolved via t() at render time so locale switches apply
  isActive: (e: Editor) => boolean;
  run: (e: Editor) => void;
  group?: boolean; // render a divider before this tool
}

// The full formatting set wired to real ProseMirror commands.
const TOOLS: Tool[] = [
  { icon: 'bold', label: 'editorx.tool.bold', isActive: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
  { icon: 'italic', label: 'editorx.tool.italic', isActive: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
  { icon: 'heading', label: 'editorx.tool.heading', isActive: (e) => e.isActive('heading', { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), group: true },
  { icon: 'quote', label: 'editorx.slash.quote', isActive: (e) => e.isActive('blockquote'), run: (e) => e.chain().focus().toggleBlockquote().run() },
  { icon: 'list', label: 'editorx.slash.bulletList', isActive: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run(), group: true },
  { icon: 'checklist', label: 'editorx.slash.checklist', isActive: (e) => e.isActive('taskList'), run: (e) => e.chain().focus().toggleTaskList().run() },
];

// Shown only while the cursor is inside a table (useEditorTick keeps it live).
const TABLE_TOOLS: Tool[] = [
  { icon: 'rowplus', label: 'editorx.tool.addRowBelow', isActive: () => false, run: (e) => e.chain().focus().addRowAfter().run(), group: true },
  { icon: 'colplus', label: 'editorx.tool.addColumnRight', isActive: () => false, run: (e) => e.chain().focus().addColumnAfter().run() },
  { icon: 'rowminus', label: 'editorx.tool.deleteRow', isActive: () => false, run: (e) => e.chain().focus().deleteRow().run() },
  { icon: 'colminus', label: 'editorx.tool.deleteColumn', isActive: () => false, run: (e) => e.chain().focus().deleteColumn().run() },
  { icon: 'table', label: 'editorx.tool.toggleHeaderRow', isActive: () => false, run: (e) => e.chain().focus().toggleHeaderRow().run() },
  { icon: 'trash', label: 'editorx.tool.deleteTable', isActive: () => false, run: (e) => e.chain().focus().deleteTable().run() },
];

/** Re-render whenever the selection/document changes so active states track the cursor. */
function useEditorTick(editor: Editor | null): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const bump = (): void => setTick((n) => n + 1);
    editor.on('transaction', bump);
    editor.on('selectionUpdate', bump);
    return () => {
      editor.off('transaction', bump);
      editor.off('selectionUpdate', bump);
    };
  }, [editor]);
}

/** Two-segment switch between rich-text (WYSIWYG) and markdown-source editing.
 * The active segment is raised; sits at the head of the desktop editor header. */
export function ModeSegmented({
  mode,
  onChange,
}: {
  mode: 'rich' | 'markdown';
  onChange: (mode: 'rich' | 'markdown') => void;
}): VNode {
  const segment = (value: 'rich' | 'markdown', icon: IconName, label: string): VNode => {
    const active = mode === value;
    return (
      <button
        title={active ? t('editorx.mode.editingAs', { mode: label }) : t('editorx.mode.switchTo', { mode: label })}
        onMouseDown={(ev) => {
          ev.preventDefault(); // don't steal the editor selection
          if (!active) onChange(value);
        }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 11px',
          borderRadius: 8, border: 'none', cursor: active ? 'default' : 'pointer',
          background: active ? 'var(--surface)' : 'transparent',
          color: active ? 'var(--accent-ink)' : 'var(--ink-3)',
          boxShadow: active ? '0 1px 2px rgba(40,28,18,.14)' : 'none',
          fontFamily: 'var(--ui)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
        }}
      >
        <Icon name={icon} size={15} color={active ? 'var(--accent-ink)' : 'var(--ink-3)'} />
        {label}
      </button>
    );
  };
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2, padding: 3, flexShrink: 0,
        borderRadius: 11, background: 'var(--surface-2)', border: '1px solid var(--line)',
      }}
    >
      {segment('rich', 'feather', t('editorx.mode.rich'))}
      {segment('markdown', 'code', t('editorx.mode.markdown'))}
    </div>
  );
}

export function EditorToolbar({ editor, floating }: { editor: Editor | null; floating?: boolean }): VNode {
  useEditorTick(editor);
  const big = !!floating;
  const sz = big ? 40 : 38;
  // Inside a table the table tools lead the strip — on the (scrollable) mobile
  // floating bar, trailing tools would sit off-screen and never be found.
  const tools = editor?.isActive('table')
    ? [...TABLE_TOOLS.map((t, i) => (i === 0 ? { ...t, group: false } : t)), ...TOOLS.map((t, i) => (i === 0 ? { ...t, group: true } : t))]
    : TOOLS;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 2, padding: 5,
        borderRadius: big ? 16 : 14, background: 'var(--surface)', border: '1px solid var(--line)',
        boxShadow: floating ? '0 10px 30px rgba(40,28,18,.18)' : 'none',
        overflowX: floating ? 'auto' : undefined, maxWidth: floating ? '100%' : undefined,
        flexWrap: floating ? undefined : 'wrap', // narrow hosts (template sheet) wrap instead of clipping
      }}
    >
      {tools.map((tool) => {
        const active = !!editor && tool.isActive(editor);
        return (
          <Fragment key={tool.icon}>
            {tool.group && <span style={{ width: 1, height: 22, background: 'var(--line)', margin: '0 4px', flexShrink: 0 }} />}
            <button
              title={t(tool.label)}
              disabled={!editor}
              onMouseDown={(ev) => {
                // Keep the editor selection — don't let the button steal focus.
                ev.preventDefault();
                if (editor) tool.run(editor);
              }}
              style={{
                width: sz, height: sz, borderRadius: big ? 11 : 10, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: editor ? 'pointer' : 'default', border: 'none',
                background: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--accent-ink)' : 'var(--ink-2)',
              }}
            >
              <Icon name={tool.icon} size={big ? 20 : 19} />
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
