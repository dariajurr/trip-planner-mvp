import { OpeningHours, PlaceCategory, Weekday } from '../models';
import { haversineMeters } from './geo';

/** Subset of a Nominatim (jsonv2) result that we use. */
export interface NominatimItem {
  lat: string;
  lon: string;
  category?: string;
  type?: string;
  name?: string;
  display_name?: string;
  osm_type?: string;
  osm_id?: number;
  address?: Record<string, string>;
  extratags?: Record<string, string>;
  namedetails?: Record<string, string>;
}

const hasNonLatin = (s: string) => /[^\u0000-\u024F\s\d\p{P}]/u.test(s);

export function osmCategory(item: Pick<NominatimItem, 'category' | 'type' | 'extratags'>): PlaceCategory {
  const cls = item.category ?? '';
  const type = item.type ?? '';
  const religion = item.extratags?.['religion'];

  if (type === 'place_of_worship') {
    return religion === 'shinto' ? 'shrine' : 'temple';
  }
  if (cls === 'tourism') {
    if (type === 'museum' || type === 'gallery') return 'museum';
    if (type === 'viewpoint') return 'viewpoint';
    return 'landmark';
  }
  if (cls === 'historic') return 'landmark';
  if (cls === 'leisure' && (type === 'park' || type === 'garden' || type === 'nature_reserve')) return 'park';
  if (cls === 'natural' && type === 'beach') return 'beach';
  if (cls === 'natural') return 'park';
  if (cls === 'shop') return 'shopping';
  if (cls === 'amenity') {
    if (['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court', 'ice_cream'].includes(type)) return 'restaurant';
    if (type === 'marketplace') return 'market';
    if (type === 'theatre' || type === 'cinema') return 'event';
  }
  if (cls === 'highway' || cls === 'place') return 'street';
  return 'other';
}

const DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_KEYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function expandDays(spec: string): Weekday[] | null {
  const out = new Set<Weekday>();
  for (const part of spec.split(',')) {
    const range = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(part.trim());
    if (!range) {
      return null;
    }
    const from = DAY_KEYS.indexOf(range[1]);
    const to = range[2] ? DAY_KEYS.indexOf(range[2]) : from;
    for (let i = from; ; i = (i + 1) % 7) {
      out.add(DAYS[i]);
      if (i === to) break;
    }
  }
  return DAYS.filter(d => out.has(d));
}

export interface ParsedHours {
  weekdays: Weekday[] | null;
  openingHours: OpeningHours | null;
  /** The raw text, always kept so nothing is lost when the syntax is too complex. */
  hoursText: string;
}

/**
 * Understands the common simple cases of OSM `opening_hours`:
 * "24/7", "09:00-17:00", "Mo-Su 09:00-17:00", "Mo-Fr,Su 10:00-18:00".
 * Anything more complex (several ranges, holidays, "off") is kept as text only.
 */
export function parseOpeningHours(raw: string): ParsedHours {
  const text = raw.trim();
  const base: ParsedHours = { weekdays: null, openingHours: null, hoursText: text };

  if (text === '24/7') {
    return { ...base, weekdays: [...DAYS], openingHours: { from: '00:00', to: '24:00' } };
  }

  const m = /^(?:([A-Za-z,\-]+)\s+)?(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(text);
  if (!m) {
    return base;
  }
  const weekdays = m[1] ? expandDays(m[1]) : [...DAYS];
  if (!weekdays) {
    return base;
  }
  const pad = (t: string) => (t.length === 4 ? `0${t}` : t);
  return { ...base, weekdays, openingHours: { from: pad(m[2]), to: pad(m[3]) } };
}

const normName = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** True when any known name of the item contains (or is contained in) the wanted name. */
export function nameMatches(item: NominatimItem, wanted: string | undefined): boolean {
  const w = normName(wanted);
  if (!w) {
    return false;
  }
  return [item.name, ...Object.values(item.namedetails ?? {})]
    .map(normName)
    .some(n => !!n && (n.includes(w) || w.includes(n)));
}

/** Picks the nearest result within maxMeters of the point, preferring one whose name matches. */
export function pickNearest(
  items: NominatimItem[],
  lat: number,
  lng: number,
  name: string | undefined,
  maxMeters = 200,
): NominatimItem | undefined {
  const wanted = normName(name);

  const scored = items
    .map(item => ({ item, d: haversineMeters(lat, lng, Number(item.lat), Number(item.lon)) }))
    .filter(x => Number.isFinite(x.d) && x.d <= maxMeters)
    .map(x => {
      const matches = !!wanted && nameMatches(x.item, name);
      return { ...x, score: x.d - (matches ? 10000 : 0) };
    })
    .sort((a, b) => a.score - b.score);

  return scored[0]?.item;
}

export interface OsmFields {
  name?: string;
  nameLocal?: string;
  category: PlaceCategory;
  address?: string;
  website?: string;
  osmRef?: string;
  parsedHours?: ParsedHours;
  wikidata?: string;
  wikipedia?: string;
  commonsFile?: string;
}

export function osmFields(item: NominatimItem): OsmFields {
  const tags = item.extratags ?? {};
  const details = item.namedetails ?? {};

  const name = item.name || details['name:en'] || details['name'];
  const local = details['name'];
  const nameLocal = local && local !== name && hasNonLatin(local) ? local : details['name:ja'] && details['name:ja'] !== name ? details['name:ja'] : undefined;

  const a = item.address ?? {};
  const street = [a['road'], a['house_number']].filter(Boolean).join(' ');
  const address = [street, a['neighbourhood'] ?? a['suburb'], a['city'] ?? a['town'] ?? a['village'], a['postcode']]
    .filter(Boolean)
    .join(', ') || undefined;

  const hours = tags['opening_hours'];
  const commons = tags['wikimedia_commons'];

  return {
    name,
    nameLocal,
    category: osmCategory(item),
    address,
    website: tags['website'] ?? tags['contact:website'],
    osmRef: item.osm_type && item.osm_id ? `${item.osm_type}/${item.osm_id}` : undefined,
    parsedHours: hours ? parseOpeningHours(hours) : undefined,
    wikidata: tags['wikidata'],
    wikipedia: tags['wikipedia'],
    commonsFile: commons && /^file:/i.test(commons) ? commons.replace(/^file:/i, '') : undefined,
  };
}
