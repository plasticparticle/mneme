// Web-Mercator slippy-map math (the projection used by OpenStreetMap raster
// tiles). Pure and dependency-free so it can be unit-tested in isolation and so
// the static-map compositor (staticmap.ts) stays focused on canvas work.
//
// The whole world at zoom z is TILE_SIZE * 2^z pixels square. A geographic
// point projects to a global pixel coordinate at a given zoom; a tile (x, y) is
// that pixel coordinate divided by TILE_SIZE and floored.

export const TILE_SIZE = 256;

/** A geographic point with a human label (the shape stored in the node attrs). */
export interface GeoPoint {
  lat: number;
  lng: number;
  label: string;
}

/** Project a lng/lat to its global pixel coordinate at `zoom`. */
export function project(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const clamped = Math.min(Math.max(sinLat, -0.9999), 0.9999); // avoid log(0) at the poles
  const y = (0.5 - Math.log((1 + clamped) / (1 - clamped)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const MIN_ZOOM = 2;
const MAX_ZOOM = 17;

/**
 * Choose a center and integer zoom that frames every point inside `size`
 * (pixels) with `padding` to spare. A single point uses `singleZoom`; multiple
 * points zoom out until their bounding box fits.
 */
export function fitView(
  points: GeoPoint[],
  size: { w: number; h: number },
  padding = 48,
  singleZoom = 13,
): { center: GeoPoint; zoom: number } {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const center: GeoPoint = {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    label: '',
  };
  if (points.length < 2) return { center, zoom: singleZoom };

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom--) {
    // Project the bounding-box corners; in Mercator, larger lat → smaller y.
    const nw = project(maxLat, minLng, zoom);
    const se = project(minLat, maxLng, zoom);
    const w = Math.abs(se.x - nw.x);
    const h = Math.abs(se.y - nw.y);
    if (w <= size.w - padding * 2 && h <= size.h - padding * 2) return { center, zoom };
  }
  return { center, zoom: MIN_ZOOM };
}
