// Template manager sheet (ui/Templates.tsx) — list, preview, editor view,
// row actions, and the two-tap delete confirmation. Template CONTENT and the
// built-in template names come from data/templates.ts (synced content records,
// deliberately English) and are not externalized here.
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
} as const;
