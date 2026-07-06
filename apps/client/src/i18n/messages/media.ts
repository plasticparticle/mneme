// Media surfaces — attachment cards + delete confirmations (ui/Attachments.tsx),
// the audio/video capture modals (ui/AudioCapture.tsx, ui/VideoCapture.tsx),
// the fullscreen lightbox (ui/Lightbox.tsx), overview thumbnails
// (ui/EntryThumbs.tsx), and the location composer (ui/LocationPicker.tsx).
export const media = {
  // Human nouns for a media kind ("Delete this photo?", captions, loading copy).
  'media.noun.audio': 'audio recording',
  'media.noun.video': 'video recording',
  'media.noun.image': 'photo',
  'media.noun.file': 'file',
  // Short form used on the delete button for audio/video.
  'media.noun.recording': 'recording',

  // Byte sizes (numbers are locale-formatted by the caller).
  'media.bytes.b': '{n} B',
  'media.bytes.kb': '{n} KB',
  'media.bytes.mb': '{n} MB',

  // Attachment cards.
  'media.loading': 'Loading {noun}…',
  'media.retryUnavailable': 'Not available yet — retry',
  'media.attachedFile': 'Attached file',
  'media.attachmentFilename': 'attachment',
  'media.downloadFile': 'Download file',

  // Delete confirmation dialog.
  'media.delete.title': 'Delete this {noun}?',
  'media.delete.body':
    '{name} will be removed from this entry, and the {noun} itself ({info}) will be deleted from this device and the sync server.',
  'media.delete.bodyUnnamed':
    'It will be removed from this entry, and the {noun} itself ({info}) will be deleted from this device and the sync server.',
  'media.delete.irreversible': 'This cannot be undone or recovered.',
  'media.delete.confirm': 'Delete {noun}',

  // Audio/video capture modals.
  'media.record.audioTitle': 'Record audio',
  'media.record.videoTitle': 'Record video',
  'media.record.reviewTitle': 'Review recording',
  'media.record.micUnavailable': 'Microphone unavailable — check browser permissions.',
  'media.record.cameraUnavailable': 'Camera unavailable — check browser permissions.',
  'media.record.unsupported': 'Recording is not supported in this browser.',
  'media.record.ready': 'Ready to record',
  'media.record.start': 'Start recording',
  'media.record.stop': 'Stop',
  'media.record.retake': 'Retake',
  'media.record.useAudio': 'Use audio',
  'media.record.useVideo': 'Use video',

  // Fullscreen image lightbox.
  'media.lightbox.viewer': 'Image viewer',
  'media.lightbox.prev': 'Previous image',
  'media.lightbox.next': 'Next image',
  'media.lightbox.counter': '{n} / {total}',

  // Overview thumbnail row: the "+N more images" hint tile.
  'media.moreCount': '+{count}',

  // Location composer.
  'media.location.title': 'Add a location',
  'media.location.place': 'Place',
  'media.location.from': 'From',
  'media.location.to': 'To',
  'media.location.searchPlace': 'Search address or paste coordinates',
  'media.location.searchDestination': 'Search destination or paste coordinates',
  'media.location.change': 'Change',
  'media.location.locating': 'Locating…',
  'media.location.useCurrent': 'Use my current location',
  'media.location.addDestination': 'Add destination (make it a trip)',
  'media.location.mapPreview': 'map preview',
  'media.location.rendering': 'Rendering map…',
  'media.location.unavailable': 'Map unavailable',
  'media.location.travelPhoto': 'travel photo',
  'media.location.removePhoto': 'Remove photo',
  'media.location.addPhoto': 'Add a travel photo',
  'media.location.privacy':
    'Address search and the one-time map render contact OpenStreetMap. The map is then frozen into your encrypted entry — opening it later makes no further requests, and the sync server never sees the location.',
  'media.location.insert': 'Insert location',
} as const;
