// Slash command palette: typing "/" in the editor opens a block-insert menu.
// Built on TipTap's Suggestion utility. The ProseMirror plugin and the
// Preact-rendered <SlashMenu> talk through a small mutable handle so neither
// side owns the other's lifecycle (the editor mounts once, outside Preact).
import { Extension, type Editor, type Range } from '@tiptap/core';
import { Suggestion, exitSuggestion, type SuggestionProps } from '@tiptap/suggestion';
import { t } from '../i18n';
import type { IconName } from '../ui/Icon';
import type { MathKind } from './math';
import type { AiEditorAction } from '../ai/prompts';

export interface SlashCommand {
  title: string;
  hint: string;
  icon: IconName;
  /** Extra match terms beyond the (localized) title — kept English on purpose. */
  keywords: string;
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
      title: t('editorx.slash.h1'), hint: t('editorx.slash.h1.hint'), icon: 'heading', keywords: 'heading 1 h1 title big',
      run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run(),
    },
    {
      title: t('editorx.slash.h2'), hint: t('editorx.slash.h2.hint'), icon: 'heading', keywords: 'heading 2 h2 subtitle',
      run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run(),
    },
    {
      title: t('editorx.slash.h3'), hint: t('editorx.slash.h3.hint'), icon: 'heading', keywords: 'heading 3 h3',
      run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run(),
    },
    {
      title: t('editorx.slash.bulletList'), hint: t('editorx.slash.bulletList.hint'), icon: 'list', keywords: 'bullet list ul unordered points',
      run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
    },
    {
      title: t('editorx.slash.numberedList'), hint: t('editorx.slash.numberedList.hint'), icon: 'olist', keywords: 'numbered list ol ordered numbers',
      run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
    },
    {
      title: t('editorx.slash.checklist'), hint: t('editorx.slash.checklist.hint'), icon: 'checklist', keywords: 'checklist todo task checkbox',
      run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run(),
    },
    {
      title: t('editorx.slash.quote'), hint: t('editorx.slash.quote.hint'), icon: 'quote', keywords: 'quote blockquote citation',
      run: (e, r) => e.chain().focus().deleteRange(r).setBlockquote().run(),
    },
    {
      title: t('editorx.slash.codeBlock'), hint: t('editorx.slash.codeBlock.hint'), icon: 'code', keywords: 'code block pre snippet monospace',
      run: (e, r) => e.chain().focus().deleteRange(r).setCodeBlock().run(),
    },
    {
      title: t('editorx.slash.table'), hint: t('editorx.slash.table.hint'), icon: 'table', keywords: 'table grid rows columns cells data measurements',
      run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      title: t('editorx.slash.divider'), hint: t('editorx.slash.divider.hint'), icon: 'divider', keywords: 'divider hr line separator rule',
      run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
    },
  ];
  if (opts.onMath) {
    const onMath = opts.onMath;
    // Both open the LaTeX dialog; you can also just type $$x$$ ($$$x$$$ for a block).
    commands.push(
      {
        title: t('editorx.slash.math'), hint: t('editorx.slash.math.hint'), icon: 'math', keywords: 'math latex katex formula equation tex inline',
        run: (e, r) => {
          e.chain().focus().deleteRange(r).run();
          onMath('inline');
        },
      },
      {
        title: t('editorx.slash.mathBlock'), hint: t('editorx.slash.mathBlock.hint'), icon: 'math', keywords: 'math latex katex formula equation tex display block',
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
      title: t('editorx.slash.link'), hint: t('editorx.slash.link.hint'), icon: 'link', keywords: 'link to entry wiki backlink reference mention connect',
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
      title: t('editorx.slash.template'), hint: t('editorx.slash.template.hint'), icon: 'copy', keywords: 'template prompt skeleton insert',
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run();
        opts.onTemplate?.();
      },
    });
  }
  if (opts.onLocation) {
    commands.push({
      title: t('editorx.slash.location'), hint: t('editorx.slash.location.hint'), icon: 'pin', keywords: 'map place travel trip journey gps coordinates address from to location route',
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run();
        opts.onLocation?.();
      },
    });
  }
  if (opts.onVideo) {
    commands.push({
      title: t('editorx.slash.video'), hint: t('editorx.slash.video.hint'), icon: 'video', keywords: 'video camera record clip media',
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run();
        opts.onVideo?.();
      },
    });
  }
  if (opts.onAudio) {
    commands.push({
      title: t('editorx.slash.audio'), hint: t('editorx.slash.audio.hint'), icon: 'mic', keywords: 'audio voice memo microphone record sound media',
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run();
        opts.onAudio?.();
      },
    });
  }
  if (opts.onImage) {
    commands.push({
      title: t('editorx.slash.image'), hint: t('editorx.slash.image.hint'), icon: 'image', keywords: 'image photo picture upload gallery media img',
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run();
        opts.onImage?.();
      },
    });
  }
  if (opts.onFile) {
    commands.push({
      title: t('editorx.slash.file'), hint: t('editorx.slash.file.hint'), icon: 'file', keywords: 'file attachment upload document pdf media',
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
        title: t('editorx.slash.aiContinue'), hint: t('editorx.slash.aiContinue.hint'), icon: 'feather', keywords: 'ai assistant write continue more',
        run: (e, r) => {
          e.chain().focus().deleteRange(r).run();
          onAi('continue');
        },
      },
      {
        title: t('editorx.slash.aiSummarize'), hint: t('editorx.slash.aiSummarize.hint'), icon: 'feather', keywords: 'ai assistant summary summarize tldr recap',
        run: (e, r) => {
          e.chain().focus().deleteRange(r).run();
          onAi('summarize');
        },
      },
      {
        title: t('editorx.slash.aiTitle'), hint: t('editorx.slash.aiTitle.hint'), icon: 'feather', keywords: 'ai assistant headline name suggest title',
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
