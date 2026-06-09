// Mounts a vanilla TipTap (ProseMirror) editor into a Preact-managed element.
// TipTap has no official Preact binding, so we drive the framework-agnostic
// `Editor` directly: create it against a ref'd <div>, force a re-render on each
// transaction so toolbar active-states stay live, and hand updates back out.
import type { RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Editor, type JSONContent } from '@tiptap/core';
import { buildExtensions, docToText } from './doc';

export interface RichEditorChange {
  json: string; // serialized ProseMirror doc
  text: string; // flattened plain text (preview / FTS)
}

export function useRichEditor(opts: {
  initial: JSONContent;
  placeholder: string;
  editable?: boolean;
  onChange?: (change: RichEditorChange) => void;
}): { editor: Editor | null; mountRef: RefObject<HTMLDivElement> } {
  const mountRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  // Keep the latest onChange without re-creating the editor.
  const onChangeRef = useRef(opts.onChange);
  onChangeRef.current = opts.onChange;

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const instance = new Editor({
      element: el,
      extensions: buildExtensions(opts.placeholder),
      content: opts.initial,
      editable: opts.editable ?? true,
      editorProps: {
        attributes: { class: 'mneme-prose', spellcheck: 'true' },
      },
      onUpdate: ({ editor: ed }) => {
        const json = ed.getJSON();
        onChangeRef.current?.({ json: JSON.stringify(json), text: docToText(json) });
      },
    });
    setEditor(instance);
    return () => {
      instance.destroy();
      setEditor(null);
    };
    // Mount once; callers remount (via key) to load a different document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { editor, mountRef };
}
