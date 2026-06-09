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

export function EditorToolbar({ editor, floating }: { editor: Editor | null; floating?: boolean }): VNode {
  useEditorTick(editor);
  const big = !!floating;
  const sz = big ? 40 : 38;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 2, padding: 5,
        borderRadius: big ? 16 : 14, background: 'var(--surface)', border: '1px solid var(--line)',
        boxShadow: floating ? '0 10px 30px rgba(40,28,18,.18)' : 'none',
        overflowX: floating ? 'auto' : undefined, maxWidth: floating ? '100%' : undefined,
      }}
    >
      {TOOLS.map((t) => {
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
