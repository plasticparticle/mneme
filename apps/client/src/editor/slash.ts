// Slash command palette: typing "/" in the editor opens a block-insert menu.
// Built on TipTap's Suggestion utility. The ProseMirror plugin and the
// Preact-rendered <SlashMenu> talk through a small mutable handle so neither
// side owns the other's lifecycle (the editor mounts once, outside Preact).
import { Extension, type Editor, type Range } from '@tiptap/core';
import { Suggestion, exitSuggestion, type SuggestionProps } from '@tiptap/suggestion';
import type { IconName } from '../ui/Icon';
import type { MathKind } from './math';
import type { AiEditorAction } from '../ai/prompts';

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
  opts: {
    onVideo?: () => void;
    onAudio?: () => void;
    onImage?: () => void;
    onFile?: () => void;
    onTemplate?: () => void;
    onMath?: (kind: MathKind) => void;
    onLink?: () => void;
    onLocation?: () => void;
    onAi?: (action: AiEditorAction) => void;
  } = {},
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
      title: 'Table', hint: 'Rows and columns', icon: 'table', keywords: 'grid rows columns cells data measurements',
      run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      title: 'Divider', hint: 'Horizontal rule', icon: 'divider', keywords: 'hr line separator rule',
      run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
    },
  ];
  if (opts.onMath) {
    const onMath = opts.onMath;
    // Both open the LaTeX dialog; you can also just type $$x$$ ($$$x$$$ for a block).
    commands.push(
      {
        title: 'Math', hint: 'Inline LaTeX formula', icon: 'math', keywords: 'latex katex formula equation tex inline',
        run: (e, r) => {
          e.chain().focus().deleteRange(r).run();
          onMath('inline');
        },
      },
      {
        title: 'Math block', hint: 'Centered display formula', icon: 'math', keywords: 'latex katex formula equation tex display block',
        run: (e, r) => {
          e.chain().focus().deleteRange(r).run();
          onMath('block');
        },
      },
    );
  }
  if (opts.onLink) {
    // Hands off to the "[[" entry picker (editor/wikilink.ts) — same flow as
    // typing "[[" directly.
    commands.push({
      title: 'Link to entry', hint: 'Reference another entry', icon: 'link', keywords: 'wiki backlink reference mention connect entry',
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run();
        opts.onLink?.();
      },
    });
  }
  if (opts.onTemplate) {
    // One entry for all templates: opens the template picker, which inserts
    // the chosen template at the cursor (the "/" range is removed first).
    commands.push({
      title: 'Template', hint: 'Insert an entry template', icon: 'copy', keywords: 'template prompt skeleton insert',
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run();
        opts.onTemplate?.();
      },
    });
  }
  if (opts.onLocation) {
    commands.push({
      title: 'Location', hint: 'Map a place or trip', icon: 'pin', keywords: 'map place travel trip journey gps coordinates address from to location route',
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run();
        opts.onLocation?.();
      },
    });
  }
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
  if (opts.onImage) {
    commands.push({
      title: 'Image', hint: 'Upload photos', icon: 'image', keywords: 'photo picture upload gallery media img',
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run();
        opts.onImage?.();
      },
    });
  }
  if (opts.onFile) {
    commands.push({
      title: 'File', hint: 'Attach a file', icon: 'file', keywords: 'attachment upload document pdf media',
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run();
        opts.onFile?.();
      },
    });
  }
  if (opts.onAi) {
    const onAi = opts.onAi;
    // Only offered when the user enabled the AI assistant (ui/AiSettings.tsx).
    // Each opens a confirm-before-insert dialog over the current entry only.
    commands.push(
      {
        title: 'Continue writing', hint: 'AI picks up where you stopped', icon: 'feather', keywords: 'ai assistant write continue more',
        run: (e, r) => {
          e.chain().focus().deleteRange(r).run();
          onAi('continue');
        },
      },
      {
        title: 'Summarize entry', hint: 'AI summary of this entry', icon: 'feather', keywords: 'ai assistant summary tldr recap',
        run: (e, r) => {
          e.chain().focus().deleteRange(r).run();
          onAi('summarize');
        },
      },
      {
        title: 'Suggest title', hint: 'AI title ideas for this entry', icon: 'feather', keywords: 'ai assistant headline name title',
        run: (e, r) => {
          e.chain().focus().deleteRange(r).run();
          onAi('title');
        },
      },
    );
  }
  return commands;
}

export function slashExtension(handle: SlashHandle, commands: SlashCommand[]): Extension {
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
            return commands.filter((c) => `${c.title} ${c.keywords}`.toLowerCase().includes(q));
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
