export interface ParsedMapInput {
  kind: 'google' | 'coords' | 'short' | 'unknown';
  name?: string;
  lat?: number;
  lng?: number;
  /** The original link, kept as googleMapsUrl for google links. */
  url?: string;
}

const NUM = '-?\\d{1,3}(?:\\.\\d+)?';
const COORDS_ONLY = new RegExp(`^\\s*(${NUM})\\s*[,;\\s]\\s*(${NUM})\\s*$`);

function valid(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function pair(lat: string, lng: string): { lat: number; lng: number } | undefined {
  const a = Number(lat);
  const b = Number(lng);
  return valid(a, b) ? { lat: a, lng: b } : undefined;
}

function decodeName(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' ')).trim();
  } catch {
    return raw.replace(/\+/g, ' ').trim();
  }
}

/**
 * Extracts what can be read from a Google Maps link without calling any API:
 * the place name and the pin coordinates. Also accepts plain "lat, lng".
 * Short links (maps.app.goo.gl) cannot be resolved in a browser, so they are reported as 'short'.
 */
export function parseMapInput(input: string): ParsedMapInput {
  const text = (input ?? '').trim();
  if (!text) {
    return { kind: 'unknown' };
  }

  const plain = COORDS_ONLY.exec(text);
  if (plain) {
    const c = pair(plain[1], plain[2]);
    return c ? { kind: 'coords', ...c } : { kind: 'unknown' };
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { kind: 'unknown' };
  }

  const host = url.hostname.toLowerCase();
  if (host === 'maps.app.goo.gl' || host === 'goo.gl' || host.endsWith('.goo.gl')) {
    return { kind: 'short', url: text };
  }
  if (!/(^|\.)google\.[a-z.]+$/.test(host)) {
    return { kind: 'unknown' };
  }

  const href = decodeURIComponent(url.href.replace(/%(?![0-9a-f]{2})/gi, '%25'));
  const result: ParsedMapInput = { kind: 'google', url: text };

  // 1. the exact pin: !3d<lat>!4d<lng>
  const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(href);
  // 2. the map centre: @lat,lng,zoom
  const centre = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(href);
  const found = (pin && pair(pin[1], pin[2])) || (centre && pair(centre[1], centre[2]));
  if (found) {
    Object.assign(result, found);
  }

  // 3. query-style links: ?q=lat,lng, ?query=..., ?ll=...
  for (const key of ['q', 'query', 'll', 'center', 'destination']) {
    const value = url.searchParams.get(key);
    if (!value) {
      continue;
    }
    const m = COORDS_ONLY.exec(value);
    if (m) {
      const c = pair(m[1], m[2]);
      if (c && result.lat === undefined) {
        Object.assign(result, c);
      }
    } else if ((key === 'q' || key === 'query') && !result.name) {
      result.name = value.trim();
    }
  }

  // 4. /maps/place/<Name>/
  const place = /\/maps\/place\/([^/@?]+)/.exec(url.pathname);
  if (place) {
    const name = decodeName(place[1]);
    if (name && !COORDS_ONLY.test(name)) {
      result.name = name;
    }
  }

  return result;
}
