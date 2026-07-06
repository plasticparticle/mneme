// Template manager sheet (ui/Templates.tsx) — list, preview, editor view,
// row actions, and the two-tap delete confirmation.
//
// The `templates.builtin.*` keys ARE the built-in template seeds' content
// (data/templates.ts builds each doc from them). A pristine built-in is a
// local-only seed that re-renders in the active language until the user edits
// it — at which point it forks into a real synced content record in whatever
// language it was showing. User-created and forked templates are content and
// stay as written.
export const templates = {
  'templates.title': 'Templates',
  'templates.new': 'New template',
  'templates.editTitle': 'Edit template',
  'templates.use': 'Use',
  'templates.untitled': 'Untitled template',
  'templates.builtin': 'built-in',
  'templates.name.placeholder': 'Template name',
  'templates.body.placeholder': 'Headings, prompts, checklists — the shape an entry starts from…',
  'templates.save': 'Save template',
  'templates.create': 'Create template',
  'templates.action.edit': 'Edit template',
  'templates.action.delete': 'Delete template',
  'templates.deletePermanently': 'Delete permanently?',
  'templates.empty': 'No templates yet — create one below.',
  'templates.emptyBody': 'Empty template',
  'templates.backToList': 'Back to list',
  'templates.all': 'All templates',

  // Built-in template seeds (names + section headings / prompts).
  'templates.builtin.daily.name': 'Daily reflection',
  'templates.builtin.daily.h1': 'How the day felt',
  'templates.builtin.daily.h2': 'Worth remembering',
  'templates.builtin.daily.h3': 'Tomorrow, one thing',
  'templates.builtin.gratitude.name': 'Three small things',
  'templates.builtin.gratitude.intro': 'Three small things that made today better:',
  'templates.builtin.dream.name': 'Dream log',
  'templates.builtin.dream.h1': 'The dream',
  'templates.builtin.dream.h2': 'How it felt',
  'templates.builtin.dream.h3': 'What it might be holding',
  'templates.builtin.experiment.name': 'Experiment log',
  'templates.builtin.experiment.h1': 'Question',
  'templates.builtin.experiment.h2': 'Setup',
  'templates.builtin.experiment.h3': 'Observations',
  'templates.builtin.experiment.col1': 'Measurement',
  'templates.builtin.experiment.col2': 'Value',
  'templates.builtin.experiment.col3': 'Notes',
  'templates.builtin.experiment.h4': 'Conclusion',
  'templates.builtin.study.name': 'Study notes',
  'templates.builtin.study.h1': 'Topic & source',
  'templates.builtin.study.h2': 'Key ideas',
  'templates.builtin.study.h3': 'In my own words',
  'templates.builtin.study.h4': 'Open questions',
  'templates.builtin.weekly.name': 'Weekly review',
  'templates.builtin.weekly.h1': 'What moved',
  'templates.builtin.weekly.h2': 'What stalled',
  'templates.builtin.weekly.h3': 'Next week',
} as const;
