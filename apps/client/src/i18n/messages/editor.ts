// Editor screen strings — screens/Editor.tsx plus the entry-header widgets
// (ui/EntryDateTime.tsx, ui/LabelField.tsx). The editor/ directory (toolbar,
// slash palette, media/math/location nodes) lives in editorx.ts.
export const editor = {
  // Fallback header title when no journal context resolves.
  'editor.write': 'Write',
  'editor.newEntry': 'New entry',
  'editor.emptyState': 'Nothing open yet.',
  'editor.bodyPlaceholder': 'Begin where you are…',
  'editor.markdownPlaceholder': '# Markdown source…',
  'editor.linkedFrom': 'Linked from',

  // ⋯ entry-actions menu
  'editor.entryActions': 'Entry actions',
  'editor.editAsRichText': 'Edit as rich text',
  'editor.editAsMarkdown': 'Edit as Markdown',
  'editor.moveToJournal': 'Move to journal…',
  'editor.deleteEntry': 'Delete entry…',
  'editor.delete.confirmTitle': 'Delete this entry?',
  'editor.delete.confirmLabel': 'Delete entry',
  'editor.delete.body': '“{title}” will be removed from all your devices.',
  'editor.delete.bodyMedia#one':
    '“{title}” will be removed from all your devices, and its media file will be deleted from this device and the sync server.',
  'editor.delete.bodyMedia#other':
    '“{title}” will be removed from all your devices, and its {count} media files will be deleted from this device and the sync server.',
  'editor.delete.cannotUndo': 'This cannot be undone.',

  // Entry date/time sheet
  'editor.date.change': 'Change date & time',
  'editor.date.heading': 'Entry date & time',
  'editor.date.time': 'Time',
  'editor.date.now': 'Now',
  'editor.date.set': 'Set date & time',

  // Label row + autocomplete
  'editor.labels.add': 'label',
  'editor.labels.placeholder': 'label…',
  'editor.labels.create': 'create “{name}”',
} as const;
