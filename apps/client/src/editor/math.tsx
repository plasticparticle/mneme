// Math typesetting: TipTap's Mathematics nodes (KaTeX-rendered LaTeX) plus the
// edit dialog. A formula is just a `latex` string in the node attrs inside
// bodyJson, so it rides the encrypted entry body like every other block — the
// relay never sees it. Typing $$x$$ makes inline math, $$$x$$$ a display block;
// clicking a rendered formula (or the "/" Math commands) opens the dialog.
import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Editor } from '@tiptap/core';
import type { AnyExtension } from '@tiptap/core';
import { Mathematics } from '@tiptap/extension-mathematics';
import katex from 'katex';
import { Btn } from '../ui/primitives';
import { Icon } from '../ui/Icon';
// KaTeX's stylesheet rides in editor.css (a CSS import here would break
// node-side tsx scripts that import editor modules).

export type MathKind = 'inline' | 'block';

/** One open edit: an existing node at `pos`, or a new one at the cursor (`pos` null). */
export interface MathEditRequest {
  kind: MathKind;
  latex: string;
  pos: number | null;
}

/** Mutable bridge between the extension's click handler and the Preact dialog —
 * same pattern as the slash menu's handle (the editor mounts outside Preact). */
export interface MathHandle {
  listener: ((req: MathEditRequest) => void) | null;
}

export function createMathHandle(): MathHandle {
  return { listener: null };
}

/** The configured Mathematics extension; clicking a node opens the dialog. */
export function mathExtension(handle?: MathHandle): AnyExtension {
  return Mathematics.configure({
    katexOptions: { throwOnError: false },
    inlineOptions: {
      onClick: (node, pos) =>
        handle?.listener?.({ kind: 'inline', latex: String(node.attrs.latex ?? ''), pos }),
    },
    blockOptions: {
      onClick: (node, pos) =>
        handle?.listener?.({ kind: 'block', latex: String(node.attrs.latex ?? ''), pos }),
    },
  });
}

/** LaTeX → HTML. Never throws; KaTeX renders bad input in its error color. */
export function renderLatex(latex: string, kind: MathKind): string {
  return katex.renderToString(latex, { throwOnError: false, displayMode: kind === 'block' });
}

/** Modal LaTeX editor with a live preview. Renders nothing until the handle's
 * listener fires (a click on a math node, or a "/" Math command). */
export function MathDialog({ handle, editor }: { handle: MathHandle; editor: Editor | null }): VNode | null {
  const [req, setReq] = useState<MathEditRequest | null>(null);
  const [latex, setLatex] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    handle.listener = (r) => {
      setReq(r);
      setLatex(r.latex);
    };
    return () => {
      handle.listener = null;
    };
  }, [handle]);

  useEffect(() => {
    if (req) inputRef.current?.focus();
  }, [req]);

  if (!req) return null;
  const editing = req.pos !== null;
  const close = (): void => setReq(null);

  const apply = (): void => {
    const t = latex.trim();
    if (editor) {
      const chain = editor.chain().focus();
      if (req.pos === null) {
        if (t) (req.kind === 'inline' ? chain.insertInlineMath({ latex: t }) : chain.insertBlockMath({ latex: t })).run();
      } else if (!t) {
        // Saving an emptied formula removes the node rather than leaving a blank atom.
        (req.kind === 'inline' ? chain.deleteInlineMath({ pos: req.pos }) : chain.deleteBlockMath({ pos: req.pos })).run();
      } else {
        (req.kind === 'inline' ? chain.updateInlineMath({ latex: t, pos: req.pos }) : chain.updateBlockMath({ latex: t, pos: req.pos })).run();
      }
    }
    close();
  };

  const remove = (): void => {
    if (editor && req.pos !== null) {
      const chain = editor.chain().focus();
      (req.kind === 'inline' ? chain.deleteInlineMath({ pos: req.pos }) : chain.deleteBlockMath({ pos: req.pos })).run();
    }
    close();
  };

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      close();
    } else if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      apply();
    }
  };

  return (
    <div
      role="dialog"
      onClick={close}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(30,22,16,.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 460, maxWidth: '100%', boxSizing: 'border-box', background: 'var(--surface)', borderRadius: 20, border: '1px solid var(--line)', padding: 22, boxShadow: '0 20px 60px rgba(30,20,12,.3)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ width: 36, height: 36, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)' }}>
            <Icon name="math" size={17} color="var(--accent-ink)" />
          </span>
          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
            {editing ? 'Edit math' : req.kind === 'block' ? 'Insert math block' : 'Insert math'}
          </h3>
        </div>

        <textarea
          ref={inputRef}
          value={latex}
          onInput={(e) => setLatex((e.target as HTMLTextAreaElement).value)}
          onKeyDown={onKeyDown}
          placeholder={req.kind === 'block' ? '\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}' : 'e^{i\\pi} + 1 = 0'}
          rows={req.kind === 'block' ? 3 : 2}
          spellcheck={false}
          style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink)', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', outline: 'none' }}
        />

        <div style={{ minHeight: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '12px 0 16px', padding: '10px 12px', borderRadius: 12, background: 'var(--surface-2)', border: '1px dashed var(--line)', overflowX: 'auto' }}>
          {latex.trim() ? (
            <div style={{ color: 'var(--ink)' }} dangerouslySetInnerHTML={{ __html: renderLatex(latex, req.kind) }} />
          ) : (
            <span style={{ fontFamily: 'var(--ui)', fontSize: 12.5, color: 'var(--ink-3)' }}>LaTeX preview</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {editing && (
            <Btn kind="danger" size="sm" onClick={remove}>Remove</Btn>
          )}
          <span style={{ flex: 1 }} />
          <Btn kind="ghost" size="sm" onClick={close}>Cancel</Btn>
          <Btn kind="primary" size="sm" onClick={apply}>{editing ? 'Save' : 'Insert'}</Btn>
        </div>
      </div>
    </div>
  );
}
