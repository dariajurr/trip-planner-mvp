import { PlacePhoto } from '../models';
import { stripHtml } from './commons';
import { haversineMeters } from './geo';

export interface GeoArticle {
  title: string;
  lat: number;
  lng: number;
  thumb?: string;
  pageImage?: string;
  extract?: string;
}

export interface CommonsFile {
  title: string;
  url: string;
  width: number;
  credit?: string;
  license?: string;
  sourceUrl?: string;
  lat?: number;
  lng?: number;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const pagesOf = (json: any): any[] => {
  const pages = json?.query?.pages;
  return pages && typeof pages === 'object' ? Object.values(pages) : [];
};

/** Wikipedia: `generator=geosearch&prop=coordinates|pageimages|extracts`. */
export function parseGeoArticles(json: unknown): GeoArticle[] {
  return pagesOf(json).flatMap((p: any) => {
    const c = p?.coordinates?.[0];
    const lat = num(c?.lat);
    const lng = num(c?.lon);
    if (typeof p?.title !== 'string' || lat === undefined || lng === undefined) return [];
    return [{
      title: p.title,
      lat,
      lng,
      ...(typeof p.thumbnail?.source === 'string' ? { thumb: p.thumbnail.source } : {}),
      ...(typeof p.pageimage === 'string' ? { pageImage: p.pageimage } : {}),
      ...(typeof p.extract === 'string' && p.extract.trim() ? { extract: p.extract.trim() } : {}),
    }];
  });
}

/** Commons: `generator=geosearch&ggsnamespace=6&prop=imageinfo|coordinates`. */
export function parseCommonsFiles(json: unknown): CommonsFile[] {
  return pagesOf(json).flatMap((p: any) => {
    const info = p?.imageinfo?.[0];
    const url: unknown = info?.thumburl ?? info?.url;
    if (typeof p?.title !== 'string' || typeof url !== 'string') return [];
    const meta = info.extmetadata ?? {};
    const c = p.coordinates?.[0];
    return [{
      title: p.title.replace(/^File:/i, ''),
      url,
      width: num(info.width) ?? num(info.thumbwidth) ?? 0,
      credit: stripHtml(meta.Artist?.value) ?? stripHtml(meta.Credit?.value),
      license: stripHtml(meta.LicenseShortName?.value),
      sourceUrl: typeof info.descriptionurl === 'string' ? info.descriptionurl : undefined,
      lat: num(c?.lat),
      lng: num(c?.lon),
    }];
  });
}

// ---- matching -------------------------------------------------------------------
const STOP_WORDS = new Set(['the', 'of', 'and', 'in', 'at', 'a', 'no', 'de', 'la', 'le', 'tokyo', 'japan']);

/** Lower-case words without accents ("Sensō-ji" -> senso, ji); runs of Japanese characters stay together. */
export function nameTokens(name: string): string[] {
  return (name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+|[\p{L}\p{N}]+/gu) ?? []).filter(t => !STOP_WORDS.has(t));
}

/** How much of the shorter name is contained in the other one (0..1). */
export function nameScore(title: string, names: (string | undefined)[]): number {
  const a = new Set(nameTokens(title));
  let best = 0;
  for (const name of names) {
    if (!name) continue;
    const b = nameTokens(name);
    if (!a.size || !b.length) continue;
    const common = b.filter(t => a.has(t)).length;
    best = Math.max(best, common / Math.min(a.size, b.length));
  }
  return best;
}

export interface PlaceRef {
  name: string;
  nameLocal?: string;
  lat: number;
  lng: number;
}

const BAD_FILE = /\.svg|\bmap\b|logo|diagram|\bplan\b|flag|coat[ _]of|icon|signage|poster|stamp|banner/i;
const GOOD_EXT = /\.(jpe?g|png|webp)$/i;

/** The nearby article that is about this place: a matching name close by, or something right at the spot. */
export function pickArticle(articles: GeoArticle[], place: PlaceRef, requireThumb = true): GeoArticle | undefined {
  const ranked = articles
    .filter(a => (a.thumb ? !BAD_FILE.test(a.pageImage ?? a.thumb) : !requireThumb))
    .map(a => ({ a, d: haversineMeters(place.lat, place.lng, a.lat, a.lng), s: nameScore(a.title, [place.name, place.nameLocal]) }))
    .filter(x => (x.s >= 0.5 && x.d <= 600) || x.d <= 40)
    .sort((x, y) => y.s - x.s || x.d - y.d);
  return ranked[0]?.a;
}

/** Up to `max` more photos taken within 150 m: names that match first, then the nearest. */
export function pickExtraFiles(files: CommonsFile[], place: PlaceRef, exclude: string[], max = 2): CommonsFile[] {
  const skip = new Set(exclude.map(e => e.replace(/^File:/i, '').toLowerCase()));
  return files
    .filter(f => GOOD_EXT.test(f.title) && !BAD_FILE.test(f.title) && f.width >= 600 && !skip.has(f.title.toLowerCase()))
    .map(f => ({ f, d: f.lat !== undefined && f.lng !== undefined ? haversineMeters(place.lat, place.lng, f.lat, f.lng) : Infinity, s: nameScore(f.title, [place.name, place.nameLocal]) }))
    .filter(x => x.d <= 150)
    .sort((x, y) => y.s - x.s || x.d - y.d)
    .slice(0, max)
    .map(x => x.f);
}

/** Same file, same id: running the search twice (or on two devices) never duplicates a photo. */
export function photoId(title: string): string {
  let h = 5381;
  for (const ch of title.replace(/^File:/i, '').toLowerCase()) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return `wm-${h.toString(36)}`;
}

export function toPlacePhoto(file: Pick<CommonsFile, 'title' | 'url' | 'credit' | 'license' | 'sourceUrl'>): PlacePhoto {
  return {
    id: photoId(file.title),
    source: 'commons',
    url: file.url,
    caption: file.title.replace(/\.[a-z]+$/i, '').replace(/_/g, ' '),
    ...(file.credit ? { credit: file.credit } : {}),
    ...(file.license ? { license: file.license } : {}),
    ...(file.sourceUrl ? { sourceUrl: file.sourceUrl } : {}),
  };
}

/** Existing photos stay; found ones are added without duplicates, at most `max` in all. */
export function mergePhotos(existing: PlacePhoto[], found: PlacePhoto[], max = 6): PlacePhoto[] {
  const out = [...existing];
  for (const p of found) if (out.length < max && !out.some(x => x.id === p.id)) out.push(p);
  return out;
}
