// System prompts for the two AI surfaces. The chat prompt embeds journal
// excerpts (selected in context.ts); the editor prompts embed only the open
// entry. Both run client-side — what's assembled here goes browser → provider,
// never near the relay.

export type AiEditorAction = 'continue' | 'summarize' | 'title';

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function chatSystemPrompt(contextText: string): string {
  return [
    `You are the assistant inside a private, end-to-end-encrypted journal. Today's date is ${today()}.`,
    'Below are excerpts from the user\'s journal, most relevant first. Answer questions using only these excerpts.',
    'When the excerpts don\'t contain the answer, say so plainly — never invent journal content.',
    'Quote or reference entries by their title and date when it helps. Be warm but concise.',
    '',
    '## Journal excerpts',
    '',
    contextText || '(no matching entries)',
  ].join('\n');
}

export function editorSystemPrompt(action: AiEditorAction, title: string, bodyText: string): string {
  const entry = `## The entry\n\nTitle: ${title || 'Untitled'}\n\n${bodyText || '(empty so far)'}`;
  switch (action) {
    case 'continue':
      return [
        'You are a writing companion inside a private journal. Continue the user\'s entry below in their voice,',
        'tone, and language. Write 1–3 natural paragraphs that pick up exactly where the text ends.',
        'Output only the continuation — no preamble, no quotation marks, no commentary.',
        '',
        entry,
      ].join('\n');
    case 'summarize':
      return [
        'You are a writing companion inside a private journal. Summarize the user\'s entry below in 2–4 sentences,',
        'in the same language the entry is written in, first person preserved.',
        'Output only the summary — no preamble, no commentary.',
        '',
        entry,
      ].join('\n');
    case 'title':
      return [
        'You are a writing companion inside a private journal. Suggest 3 short titles (max 6 words each) for the',
        'entry below, in the same language the entry is written in.',
        'Output exactly 3 lines, one title per line — no numbering, no quotes, no commentary.',
        '',
        entry,
      ].join('\n');
  }
}

export function editorUserMessage(action: AiEditorAction): string {
  switch (action) {
    case 'continue':
      return 'Continue the entry.';
    case 'summarize':
      return 'Summarize the entry.';
    case 'title':
      return 'Suggest 3 titles.';
  }
}
