// Slash command palette: typing "/" in the editor opens a block-insert menu.
// Built on TipTap's Suggestion utility. The ProseMirror plugin and the
// Preact-rendered <SlashMenu> talk through a small mutable handle so neither
// side owns the other's lifecycle (the editor mounts once, outside Preact).
import { Extension, type Editor, type JSONContent, type Range } from '@tiptap/core';
import { Suggestion, exitSuggestion, type SuggestionProps } from '@tiptap/suggestion';
import type { IconName } from '../ui/Icon';
import type { TemplateRecord } from '../sync/engine';

export interface SlashCommand {
  title: string;
  hint: string;
  icon: IconName;
  keywords: string; // extra match terms beyond the title
  run: (editor: Editor, range: Range) => void;
}

/** Everything the menu needs to render one open palette. */
export interface SlashMenuState {
  items: SlashCommand[];
  clientRect: (() => DOMRect | null) | null;
  select: (item: SlashCommand) => void;
  dismiss: () => void;
}

export interface SlashMenuListener {
  show: (state: SlashMenuState) => void;
  hide: () => void;
  keydown: (event: KeyboardEvent) => boolean;
}

/** Mutable bridge between the suggestion plugin and the Preact menu. */
export interface SlashHandle {
  listener: SlashMenuListener | null;
}

export function createSlashHandle(): SlashHandle {
  return { listener: null };
}

export function buildSlashCommands(
  opts: { onVideo?: () => void; onAudio?: () => void; templates?: TemplateRecord[] } = {},
): SlashCommand[] {
  const commands: SlashCommand[] = [
    {
      title: 'Heading 1', hint: 'Large section heading', icon: 'heading', keywords: 'h1 title big',
      run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run(),
    },
    {
      title: 'Heading 2', hint: 'Medium section heading', icon: 'heading', keywords: 'h2 subtitle',
      run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run(),
    },
    {
      title: 'Heading 3', hint: 'Small section heading', icon: 'heading', keywords: 'h3',
      run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run(),
    },
    {
      title: 'Bullet list', hint: 'Simple unordered list', icon: 'list', keywords: 'ul unordered points',
      run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
    },
    {
      title: 'Numbered list', hint: 'Ordered list with numbers', icon: 'olist', keywords: 'ol ordered numbers',
      run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
    },
    {
      title: 'Checklist', hint: 'List with checkboxes', icon: 'checklist', keywords: 'todo task checkbox',
      run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run(),
    },
    {
      title: 'Quote', hint: 'Pulled-out quotation', icon: 'quote', keywords: 'blockquote citation',
      run: (e, r) => e.chain().focus().deleteRange(r).setBlockquote().run(),
    },
    {
      title: 'Code block', hint: 'Monospaced code', icon: 'code', keywords: 'pre snippet monospace',
      run: (e, r) => e.chain().focus().deleteRange(r).setCodeBlock().run(),
    },
    {
      title: 'Divider', hint: 'Horizontal rule', icon: 'divider', keywords: 'hr line separator rule',
      run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
    },
  ];
  if (opts.onVideo) {
    commands.push({
      title: 'Video', hint: 'Record a video clip', icon: 'video', keywords: 'camera record clip media',
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run();
        opts.onVideo?.();
      },
    });
  }
  if (opts.onAudio) {
    commands.push({
      title: 'Audio', hint: 'Record a voice note', icon: 'mic', keywords: 'voice memo microphone record sound media',
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run();
        opts.onAudio?.();
      },
    });
  }
  // Entry templates: typing "/" then the template's name drops its blocks in
  // at the cursor. Tombstoned or body-less templates never make it here.
  for (const t of opts.templates ?? []) {
    if (t.deleted) continue;
    let doc: JSONContent | null = null;
    try {
      doc = t.bodyJson ? (JSON.parse(t.bodyJson) as JSONContent) : null;
    } catch {
      /* unreadable body — skip the command rather than insert garbage */
    }
    const content = doc?.content;
    if (!content?.length) continue;
    commands.push({
      title: t.name || 'Untitled template', hint: 'Insert template', icon: 'copy', keywords: 'template insert',
      run: (e, r) => e.chain().focus().deleteRange(r).insertContent(content).run(),
    });
  }
  return commands;
}

// `commands` is a getter so the palette always sees the current command list —
// the editor mounts once, but templates can be created/renamed/deleted while
// an entry stays open.
export function slashExtension(handle: SlashHandle, commands: () => SlashCommand[]): Extension {
  return Extension.create({
    name: 'slashCommands',
    addProseMirrorPlugins() {
      const toState = (p: SuggestionProps<SlashCommand, SlashCommand>): SlashMenuState => ({
        items: p.items,
        clientRect: p.clientRect ?? null,
        select: (item) => p.command(item),
        dismiss: () => exitSuggestion(p.editor.view),
      });
      return [
        Suggestion<SlashCommand, SlashCommand>({
          editor: this.editor,
          char: '/',
          command: ({ editor, range, props }) => props.run(editor, range),
          items: ({ query }) => {
            const q = query.trim().toLowerCase();
            return commands().filter((c) => `${c.title} ${c.keywords}`.toLowerCase().includes(q));
          },
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
