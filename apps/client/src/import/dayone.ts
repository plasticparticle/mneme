// Day One JSON-export parser. Day One exports a .zip: one `<Journal Name>.json`
// per notebook plus `photos/`, `videos/`, `audios/`, `pdfs/` folders. Each entry's
// `text` is Markdown; embedded media is referenced inline as
// `![](dayone-moment://<identifier>)` (photos) or `dayone-moment:/video/<id>` etc.,
// and the matching `photos`/`videos`/… array on the entry maps that identifier to a
// file named `<folder>/<md5>.<type>`.
//
// This module is pure data: it unzips, parses, and resolves moment identifiers to
// raw bytes. Turning that into encrypted Mneme entries happens in `run.ts`, which
// needs the live app (createEntry/addMedia). Nothing here touches crypto or the DB.
import { unzipSync, strFromU8 } from 'fflate';

export type MomentKind = 'image' | 'video' | 'audio' | 'file';

/** A Day One "moment" (photo/video/audio/pdf) as it appears on an entry. */
export interface DayOneMoment {
  identifier: string;
  md5?: string;
  type?: string; // file extension sans dot: 'jpeg', 'png', 'mov', 'm4a', 'pdf'…
  width?: number;
  height?: number;
  duration?: number; // seconds (video/audio)
}

export interface DayOneEntry {
  uuid?: string;
  creationDate?: string; // ISO 8601
  modifiedDate?: string;
  text?: string; // Markdown
  tags?: string[];
  starred?: boolean;
  isAllDay?: boolean;
  photos?: DayOneMoment[];
  videos?: DayOneMoment[];
  audios?: DayOneMoment[];
  pdfAttachments?: DayOneMoment[];
}

interface DayOneJournalFile {
  metadata?: { version?: string };
  entries?: DayOneEntry[];
}

/** One resolved moment: kind, raw bytes, and metadata ready for `addMedia`. */
export interface ResolvedMoment {
  identifier: string;
  kind: MomentKind;
  bytes: Uint8Array;
  mime: string;
  name: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

/** One Day One journal mapped to its entries, newest first. */
export interface ParsedJournal {
  /** Journal name, taken from the JSON filename (`Travel.json` → "Travel"). */
  name: string;
  entries: DayOneEntry[];
}

/** A fully read export: the journals plus a per-entry moment resolver. */
export interface DayOneArchive {
  journals: ParsedJournal[];
  /** Total entries across all journals (for progress + the pre-import summary). */
  entryCount: number;
  /** Total resolvable media moments (for the summary). */
  mediaCount: number;
  /**
   * Resolve one of an entry's moments to bytes, or null when the file is missing
   * from the archive (a partial export). The kind is decided by which array the
   * moment came from, so this takes the moment + its kind.
   */
  resolve(moment: DayOneMoment, kind: MomentKind): ResolvedMoment | null;
}

const EXT_MIME: Record<string, string> = {
  jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif', webp: 'image/webp', tiff: 'image/tiff',
  mov: 'video/quicktime', mp4: 'video/mp4', m4v: 'video/x-m4v', avi: 'video/x-msvideo',
  m4a: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav', aiff: 'audio/aiff',
  pdf: 'application/pdf',
};

const FOLDER: Record<MomentKind, string> = { image: 'photos', video: 'videos', audio: 'audios', file: 'pdfs' };

function mimeFor(type: string | undefined, kind: MomentKind): string {
  const ext = (type ?? '').toLowerCase();
  if (ext && EXT_MIME[ext]) return EXT_MIME[ext];
  return kind === 'image' ? 'image/jpeg' : kind === 'video' ? 'video/quicktime' : kind === 'audio' ? 'audio/mp4' : 'application/octet-stream';
}

/**
 * Parse a Day One export zip into journals + a moment resolver.
 * @param zip the raw .zip bytes (from a file input).
 */
export function parseDayOneArchive(zip: Uint8Array): DayOneArchive {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip);
  } catch {
    throw new Error('This file is not a valid .zip — export your Day One journal as JSON and pick the .zip it produces.');
  }

  // Index media files by basename (`<md5>.<type>`) and by md5 (extension-stripped),
  // tolerating nested paths some exports use ("Export/photos/…").
  const byBasename = new Map<string, Uint8Array>();
  const byStem = new Map<string, Uint8Array>();
  const journals: ParsedJournal[] = [];

  for (const [path, bytes] of Object.entries(files)) {
    if (path.endsWith('/') || bytes.length === 0) continue;
    const base = path.slice(path.lastIndexOf('/') + 1);
    if (path.toLowerCase().endsWith('.json')) {
      let parsed: DayOneJournalFile;
      try {
        parsed = JSON.parse(strFromU8(bytes)) as DayOneJournalFile;
      } catch {
        continue; // not a journal JSON (could be unrelated metadata)
      }
      if (!Array.isArray(parsed.entries)) continue;
      const name = base.replace(/\.json$/i, '') || 'Imported';
      journals.push({ name, entries: parsed.entries });
      continue;
    }
    byBasename.set(base, bytes);
    const dot = base.lastIndexOf('.');
    byStem.set(dot > 0 ? base.slice(0, dot) : base, bytes);
  }

  if (journals.length === 0) {
    throw new Error('No Day One journal JSON found in the zip. Make sure you exported as JSON, not PDF or plain text.');
  }

  const findBytes = (moment: DayOneMoment): Uint8Array | null => {
    const { md5, type } = moment;
    if (md5 && type && byBasename.has(`${md5}.${type}`)) return byBasename.get(`${md5}.${type}`)!;
    if (md5 && byStem.has(md5)) return byStem.get(md5)!;
    // Some exports name files by the moment identifier instead of the md5.
    if (byStem.has(moment.identifier)) return byStem.get(moment.identifier)!;
    if (type && byBasename.has(`${moment.identifier}.${type}`)) return byBasename.get(`${moment.identifier}.${type}`)!;
    return null;
  };

  const resolve = (moment: DayOneMoment, kind: MomentKind): ResolvedMoment | null => {
    const bytes = findBytes(moment);
    if (!bytes) return null;
    const ext = (moment.type ?? '').toLowerCase();
    return {
      identifier: moment.identifier,
      kind,
      bytes,
      mime: mimeFor(moment.type, kind),
      name: `${FOLDER[kind]}-${(moment.md5 ?? moment.identifier).slice(0, 8)}${ext ? '.' + ext : ''}`,
      width: moment.width,
      height: moment.height,
      durationMs: typeof moment.duration === 'number' ? Math.round(moment.duration * 1000) : undefined,
    };
  };

  let entryCount = 0;
  let mediaCount = 0;
  for (const j of journals) {
    entryCount += j.entries.length;
    for (const e of j.entries) {
      for (const arr of [e.photos, e.videos, e.audios, e.pdfAttachments]) {
        for (const m of arr ?? []) if (findBytes(m)) mediaCount++;
      }
    }
  }

  return { journals, entryCount, mediaCount, resolve };
}

/** Map a `dayone-moment:` URL to the moment kind + identifier it references. */
export function parseMomentUrl(url: string): { kind: MomentKind; identifier: string } | null {
  const m = url.match(/^dayone-moment:\/(?:\/)?(?:(video|audio|pdfAttachment)\/)?([A-Za-z0-9-]+)/);
  if (!m) return null;
  const tag = m[1];
  const kind: MomentKind = tag === 'video' ? 'video' : tag === 'audio' ? 'audio' : tag === 'pdfAttachment' ? 'file' : 'image';
  return { kind, identifier: m[2] };
}

/** Collect an entry's moments into one lookup keyed by identifier (+ its kind). */
export function entryMoments(entry: DayOneEntry): Map<string, { moment: DayOneMoment; kind: MomentKind }> {
  const map = new Map<string, { moment: DayOneMoment; kind: MomentKind }>();
  for (const [arr, kind] of [
    [entry.photos, 'image'], [entry.videos, 'video'], [entry.audios, 'audio'], [entry.pdfAttachments, 'file'],
  ] as [DayOneMoment[] | undefined, MomentKind][]) {
    for (const m of arr ?? []) if (m.identifier) map.set(m.identifier, { moment: m, kind });
  }
  return map;
}
