// Address ⇄ coordinate lookup via OpenStreetMap Nominatim. This is the one
// place in the location feature that sends an address to a third party, and it
// only runs while the user is actively composing a location (the resulting map
// is frozen into an encrypted image — see staticmap.ts). The relay is never
// involved. Callers debounce input: Nominatim's usage policy is ≤ 1 req/s.
import type { GeoPoint } from './mercator';

const SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name: string;
}

// Nominatim's display_name is a long comma chain ("Brandenburg Gate, Pariser
// Platz, Mitte, Berlin, …"); keep the leading, most-specific parts for a chip.
function shortLabel(displayName: string): string {
  const parts = displayName.split(',').map((p) => p.trim());
  return parts.slice(0, 2).join(', ') || displayName;
}

function isValidPlace(p: NominatimPlace): boolean {
  return Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)) && !!p.display_name;
}

/** Look up an address string; returns up to 5 candidate points (empty on failure). */
export async function searchAddress(query: string): Promise<GeoPoint[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const url = `${SEARCH_URL}?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = (await res.json()) as NominatimPlace[];
    return data
      .filter(isValidPlace)
      .map((p) => ({ lat: Number(p.lat), lng: Number(p.lon), label: shortLabel(p.display_name) }));
  } catch {
    return []; // offline or blocked — the caller can still enter raw coordinates
  }
}

/** Name a raw coordinate (e.g. from geolocation); null if it can't be resolved. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `${REVERSE_URL}?format=jsonv2&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<NominatimPlace>;
    return data.display_name ? shortLabel(data.display_name) : null;
  } catch {
    return null;
  }
}
