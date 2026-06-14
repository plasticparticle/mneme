// Downscale an image blob to a small JPEG for the entry-overview lists. The
// lists would otherwise decode full-resolution (multi-MB) images into the DOM
// just to draw a ~40px tile; a generated thumbnail keeps that cheap. Result is
// cached in the local `media` table (db.putMediaThumb) so it is produced once.

// Longest-edge target in device pixels — comfortably covers the small list
// tiles even on high-DPR screens, while staying tiny on disk.
const THUMB_PX = 160;

/** Produce a downscaled JPEG thumbnail (longest edge ≤ THUMB_PX) of an image blob. */
export async function makeThumbnail(blob: Blob, px: number = THUMB_PX): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  try {
    const longest = Math.max(bmp.width, bmp.height) || 1;
    const scale = Math.min(1, px / longest); // never upscale
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d canvas context');
    ctx.drawImage(bmp, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.8),
    );
  } finally {
    bmp.close();
  }
}
