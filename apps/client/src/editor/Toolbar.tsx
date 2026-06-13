import type { VNode } from 'preact';
import { Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Editor } from '@tiptap/core';
import { Icon, type IconName } from '../ui/Icon';

interface Tool {
  icon: IconName;
  label: string;
  isActive: (e: Editor) => boolean;
  run: (e: Editor) => void;
  group?: boolean; // render a divider before this tool
}

// The full formatting set wired to real ProseMirror commands.
const TOOLS: Tool[] = [
  { icon: 'bold', label: 'Bold', isActive: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
  { icon: 'italic', label: 'Italic', isActive: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
  { icon: 'heading', label: 'Heading', isActive: (e) => e.isActive('heading', { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), group: true },
  { icon: 'quote', label: 'Quote', isActive: (e) => e.isActive('blockquote'), run: (e) => e.chain().focus().toggleBlockquote().run() },
  { icon: 'list', label: 'Bullet list', isActive: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run(), group: true },
  { icon: 'checklist', label: 'Checklist', isActive: (e) => e.isActive('taskList'), run: (e) => e.chain().focus().toggleTaskList().run() },
];

// Shown only while the cursor is inside a table (useEditorTick keeps it live).
const TABLE_TOOLS: Tool[] = [
  { icon: 'rowplus', label: 'Add row below', isActive: () => false, run: (e) => e.chain().focus().addRowAfter().run(), group: true },
  { icon: 'colplus', label: 'Add column right', isActive: () => false, run: (e) => e.chain().focus().addColumnAfter().run() },
  { icon: 'rowminus', label: 'Delete row', isActive: () => false, run: (e) => e.chain().focus().deleteRow().run() },
  { icon: 'colminus', label: 'Delete column', isActive: () => false, run: (e) => e.chain().focus().deleteColumn().run() },
  { icon: 'table', label: 'Toggle header row', isActive: () => false, run: (e) => e.chain().focus().toggleHeaderRow().run() },
  { icon: 'trash', label: 'Delete table', isActive: () => false, run: (e) => e.chain().focus().deleteTable().run() },
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

/** Switches the editor between rich-text (WYSIWYG) and markdown-source editing.
 * Lives next to the formatting toolbar; the label shows the active mode. */
export function ModeToggle({
  mode,
  onToggle,
  floating,
}: {
  mode: 'rich' | 'markdown';
  onToggle: () => void;
  floating?: boolean;
}): VNode {
  const md = mode === 'markdown';
  const h = floating ? 40 : 34;
  return (
    <button
      title={md ? 'Switch to rich text editing' : 'Switch to markdown source'}
      onMouseDown={(ev) => {
        ev.preventDefault(); // don't steal the editor selection
        onToggle();
      }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: floating ? 0 : 6, flexShrink: 0,
        height: h, padding: floating ? 0 : '0 11px', width: floating ? h : undefined,
        justifyContent: 'center', borderRadius: floating ? 14 : 10, cursor: 'pointer',
        border: '1px solid var(--line)',
        background: md ? 'var(--accent-soft)' : 'var(--surface)',
        color: md ? 'var(--accent-ink)' : 'var(--ink-2)',
        boxShadow: floating ? '0 10px 30px rgba(40,28,18,.18)' : 'none',
        fontFamily: 'var(--ui)', fontSize: 12.5, fontWeight: 600,
      }}
    >
      <Icon name="code" size={floating ? 20 : 16} color={md ? 'var(--accent-ink)' : 'var(--ink-2)'} />
      {!floating && (md ? 'Markdown' : 'Rich text')}
    </button>
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
      {tools.map((t) => {
        const active = !!editor && t.isActive(editor);
        return (
          <Fragment key={t.icon}>
            {t.group && <span style={{ width: 1, height: 22, background: 'var(--line)', margin: '0 4px', flexShrink: 0 }} />}
            <button
              title={t.label}
              disabled={!editor}
              onMouseDown={(ev) => {
                // Keep the editor selection — don't let the button steal focus.
                ev.preventDefault();
                if (editor) t.run(editor);
              }}
              style={{
                width: sz, height: sz, borderRadius: big ? 11 : 10, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: editor ? 'pointer' : 'default', border: 'none',
                background: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--accent-ink)' : 'var(--ink-2)',
              }}
            >
              <Icon name={t.icon} size={big ? 20 : 19} />
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
