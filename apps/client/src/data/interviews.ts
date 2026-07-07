// Predefined guided-interview types. Like the entry templates in ./templates.ts
// these are *seeds*, not fixtures: every device lays them down once as ordinary
// interview-type rows (pristine, local-only), and from then on the user owns them
// — rename, rewrite the prompt, delete. Ids are random per device (a well-known id
// in the cleartext entry_id would tell the relay which blobs are interview types);
// state/data.tsx retires a pristine seed when a synced copy of the same `slug`
// arrives from another device.
//
// The user-visible bits (name + intro) come from `assistant.interview.builtin.*`
// catalog keys, so a pristine seed follows the app language (state/data.tsx
// projects it through localizeBuiltinInterview on display); the first edit forks
// it into a real synced record in whatever language it was showing. The `prompt`
// stays English on purpose: it is a model instruction, not user copy — the
// interview's output language is steered by the reply-language directive in
// ai/prompts.ts, and English instructions are the most reliable across backends.
//
// `prompt` is the question *strategy* for one interview type — the themes to cover
// and the tone. The generic interview rules (ask ONE question at a time, keep it
// short and warm, stop after a handful, then offer to write the entry) live once in
// ai/prompts.ts so every type inherits them; the prompt here only adds specifics.
import { newTemplateId } from '../sync/ids';
import type { InterviewType } from '../sync/engine';
import { t, type MessageKey } from '../i18n';

interface BuiltinInterview {
  slug: string;
  nameKey: MessageKey;
  introKey: MessageKey;
  prompt: string;
}

export const BUILTIN_INTERVIEWS: BuiltinInterview[] = [
  {
    slug: 'daily-checkin',
    nameKey: 'assistant.interview.builtin.daily-checkin.name',
    introKey: 'assistant.interview.builtin.daily-checkin.intro',
    prompt:
      'This is a relaxed daily check-in. Cover, roughly in this order: how the day went overall and how they feel ' +
      'right now; one moment worth remembering; anything that weighed on them or felt hard; and one small thing ' +
      'they want to carry into tomorrow. Keep it light and conversational — this should feel like a friend asking, ' +
      'not a form.',
  },
  {
    slug: 'morning-intention',
    nameKey: 'assistant.interview.builtin.morning-intention.name',
    introKey: 'assistant.interview.builtin.morning-intention.intro',
    prompt:
      'This is a morning intention-setting interview, done before the day really starts. Cover: how they slept and ' +
      'how they feel as the day begins; the one thing that would make today feel worthwhile; anything they are ' +
      'looking forward to or quietly dreading; and a single intention or word to hold onto today. Keep it brief and ' +
      'forward-looking.',
  },
  {
    slug: 'evening-reflection',
    nameKey: 'assistant.interview.builtin.evening-reflection.name',
    introKey: 'assistant.interview.builtin.evening-reflection.intro',
    prompt:
      'This is a calm evening reflection for winding down. Cover: what actually happened today versus what they ' +
      'expected; a moment they are grateful for; something that drained or frustrated them and what it taught them; ' +
      'and what they want to let go of before sleep. Use a slow, gentle tone.',
  },
  {
    slug: 'gratitude',
    nameKey: 'assistant.interview.builtin.gratitude.name',
    introKey: 'assistant.interview.builtin.gratitude.intro',
    prompt:
      'This is a gratitude interview. Help them name three to five specific things they are grateful for — nudge ' +
      'toward concrete, small, sensory details rather than generalities, and gently ask why each one mattered. If ' +
      'they get stuck, offer a category (a person, a small comfort, something their body let them do). Warm and ' +
      'unhurried.',
  },
  {
    slug: 'weekly-review',
    nameKey: 'assistant.interview.builtin.weekly-review.name',
    introKey: 'assistant.interview.builtin.weekly-review.intro',
    prompt:
      'This is a weekly review covering the past seven days. Cover: what moved forward or went well this week; what ' +
      'stalled, slipped, or disappointed them; what they learned about themselves or their work; and the one or two ' +
      'things that most deserve their attention next week. Think in terms of the week as a whole, not a single day.',
  },
  {
    slug: 'mood-energy',
    nameKey: 'assistant.interview.builtin.mood-energy.name',
    introKey: 'assistant.interview.builtin.mood-energy.intro',
    prompt:
      'This is a mood and energy check. Cover: their overall mood today on their own terms (and, if they like, a 1–10 ' +
      'rating); their physical energy and what fed or drained it (sleep, food, movement, people); the strongest ' +
      'emotion they felt and what triggered it; and one thing that might help tomorrow feel a little better. Keep it ' +
      'matter-of-fact and non-judgmental so it reads well when compared week to week.',
  },
];

const BY_SLUG = new Map(BUILTIN_INTERVIEWS.map((b) => [b.slug, b]));

/** Materialize the built-ins as pristine interview-type records (fresh random ids),
    with name + intro in the current locale. */
export function seedBuiltinInterviews(now: number): InterviewType[] {
  return BUILTIN_INTERVIEWS.map((b) => ({
    id: newTemplateId(),
    name: t(b.nameKey),
    intro: t(b.introKey),
    prompt: b.prompt,
    builtin: b.slug,
    pristine: true,
    createdAt: now,
    updatedAt: now,
  }));
}

/** Display projection: re-render a pristine built-in seed's name + intro in the
    active locale. Non-built-in, forked, or unknown-slug rows pass through
    unchanged — only still-pristine seeds follow the language, never a record the
    user owns. (Mirror of templates.ts localizeBuiltinTemplate.) */
export function localizeBuiltinInterview(rec: InterviewType): InterviewType {
  if (!rec.pristine || !rec.builtin) return rec;
  const b = BY_SLUG.get(rec.builtin);
  if (!b) return rec;
  return { ...rec, name: t(b.nameKey), intro: t(b.introKey) };
}
