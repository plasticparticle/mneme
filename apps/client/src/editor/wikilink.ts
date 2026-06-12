// Cross-entry links: an inline atom node referencing another entry by id, the
// learning/lab-notebook unlock ("builds on →", "continues experiment from →").
// The node attrs ({ entryId, label }) serialize into bodyJson and ride the
// encrypted entry body — entry ids are random (sync/ids.ts), so even if a link
// id were visible it would leak nothing, and the relay never sees it anyway.
//
// Typing "[[" opens an entry picker (TipTap Suggestion, rendered by the same
// <SlashMenu> the "/" palette uses); picking inserts the node. The label is the
// target's title at link time — node views re-resolve the live title when the
// doc opens, so renames heal on the next view, and a deleted target renders as
// a muted, dead chip instead of breaking the document.
import { Extension, Node, mergeAttributes, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion, exitSuggestion, type SuggestionProps } from '@tiptap/suggestion';
import type { JournalEntry } from '../sync/engine';
import type { SlashCommand, SlashHandle, SlashMenuState } from './slash';

export const ENTRY_LINK_NODE = 'entryLink';

export interface WikiLinkHandlers {
  /** Live title of the target entry, or null when it no longer exists. */
  resolveTitle: (entryId: string) => string | null;
  /** Navigate to the target entry. */
  onOpen?: (entryId: string) => void;
}

/** The inline link node. Always registered (docs containing links must open
 * everywhere); without handlers it renders the stored label, non-navigable. */
export function wikiLinkNode(handlers?: WikiLinkHandlers): Node {
  return Node.create({
    name: ENTRY_LINK_NODE,
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() {
      return {
        entryId: { default: '' },
        label: { default: '' },
      };
    },
    parseHTML() {
      return [{ tag: 'span[data-entry-link]' }];
    },
    renderHTML({ node, HTMLAttributes }) {
      return [
        'span',
        mergeAttributes(HTMLAttributes, { 'data-entry-link': '' }),
        String(node.attrs.label ?? ''),
      ];
    },
    addNodeView() {
      return ({ node }) => {
        const dom = document.createElement('span');
        dom.className = 'mneme-wikilink';
        const entryId = String(node.attrs.entryId ?? '');
        const live = handlers ? handlers.resolveTitle(entryId) : String(node.attrs.label ?? '');
        dom.textContent = live ?? String(node.attrs.label ?? '') ?? 'Untitled';
        if (handlers && live === null) {
          dom.dataset.missing = '';
          dom.title = 'Linked entry no longer exists';
        } else if (handlers?.onOpen) {
          dom.title = 'Open linked entry';
          dom.addEventListener('click', (ev) => {
            ev.preventDefault();
            handlers.onOpen?.(entryId);
          });
        }
        return {
          dom,
          // Let clicks reach the navigation handler instead of ProseMirror.
          stopEvent: (event) => event.type === 'click',
        };
      };
    },
  });
}

function insertEntryLink(editor: Editor, range: Range, target: JournalEntry): void {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent([
      { type: ENTRY_LINK_NODE, attrs: { entryId: target.id, label: target.title || 'Untitled' } },
      { type: 'text', text: ' ' },
    ])
    .run();
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Picker items for the "[[" suggester: other live entries matching the query,
 * most recently touched first, shaped as SlashCommands so <SlashMenu> renders them. */
export function buildEntryLinkItems(
  entries: JournalEntry[],
  currentEntryId: string,
  query: string,
): SlashCommand[] {
  const q = query.trim().toLowerCase();
  return entries
    .filter((e) => e.id !== currentEntryId && !e.deleted)
    .filter((e) => !q || (e.title || 'Untitled').toLowerCase().includes(q))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8)
    .map((e) => {
      const d = new Date(e.createdAt);
      return {
        title: e.title || 'Untitled',
        hint: `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
        icon: 'link' as const,
        keywords: '',
        run: (editor, range) => insertEntryLink(editor, range, e),
      };
    });
}

/** The "[[" suggester. Same plugin/menu split as the slash palette; needs its
 * own plugin key so it can coexist with the "/" Suggestion in one editor. */
export function wikiLinkSuggestion(
  handle: SlashHandle,
  items: (query: string) => SlashCommand[],
): Extension {
  return Extension.create({
    name: 'entryLinkSuggestion',
    addProseMirrorPlugins() {
      const toState = (p: SuggestionProps<SlashCommand, SlashCommand>): SlashMenuState => ({
        items: p.items,
        clientRect: p.clientRect ?? null,
        select: (item) => p.command(item),
        dismiss: () => exitSuggestion(p.editor.view),
      });
      return [
        Suggestion<SlashCommand, SlashCommand>({
          pluginKey: new PluginKey('entryLinkSuggestion'),
          editor: this.editor,
          char: '[[',
          allowSpaces: true, // entry titles contain spaces
          command: ({ editor, range, props }) => props.run(editor, range),
          items: ({ query }) => items(query),
          render: () => ({
            onStart: (p) => handle.listener?.show(toState(p)),
            onUpdate: (p) => handle.listener?.show(toState(p)),
            onExit: () => handle.listener?.hide(),
            onKeyDown: (p) => handle.listener?.keydown(p.event) ?? false,
          }),
        }),
      ];
    },
  });
}
