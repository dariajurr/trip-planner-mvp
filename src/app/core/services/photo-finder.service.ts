import { Injectable, inject, signal } from '@angular/core';

import { City, Place, PlacePhoto, PlaceSummary } from '../models';
import { UserContentStore } from '../state/user-content.store';
import { CommonsFile, GeoArticle, mergePhotos, parseCommonsFiles, parseGeoArticles, pickArticle, pickExtraFiles, toPlacePhoto } from '../utils/photo-search';
import { PhotoStorageService } from './photo-storage.service';

export interface FinderProgress {
  state: 'idle' | 'running' | 'done' | 'cancelled' | 'offline';
  total: number;
  done: number;
  withPhotos: number;
  withText: number;
  failed: number;
}

const IDLE: FinderProgress = { state: 'idle', total: 0, done: 0, withPhotos: 0, withText: 0, failed: 0 };
const TIMEOUT_MS = 10_000;
const PAUSE_MS = 250;
const GIVE_UP_AFTER = 5; // failures in a row: most likely there is no connection
const MAX_SUMMARY = 300;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const wiki = (lang: string, query: string) => `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&${query}`;
const commons = (query: string) => `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&${query}`;

/** First sentences of an extract, at most `max` characters, cut at a sentence end where possible. */
export function shortSummary(text: string, max = MAX_SUMMARY): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('。'));
  return end > 60 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

/**
 * Finds a photo, a few more photos and a short description for a place, using only open sources:
 * Wikipedia (articles near the coordinates) and Wikimedia Commons (geotagged photos, with author and licence).
 * Everything found is stored on the device, so it also works without a connection.
 */
@Injectable({ providedIn: 'root' })
export class PhotoFinderService {
  private readonly store = inject(UserContentStore);
  private readonly files = inject(PhotoStorageService);

  readonly progress = signal<FinderProgress>(IDLE);
  private abort: AbortController | null = null;

  cancel(): void {
    this.abort?.abort();
  }

  /** Searches for each place in turn and stores what was found. Returns how many places got new photos. */
  async run(places: Place[]): Promise<number> {
    this.abort = new AbortController();
    const signal = this.abort.signal;
    const p: FinderProgress = { ...IDLE, state: 'running', total: places.length };
    this.progress.set(p);

    let failuresInARow = 0;
    let enriched = 0;
    for (const place of places) {
      if (signal.aborted) break;
      try {
        const found = await this.findForPlace(place, signal);
        failuresInARow = 0;
        const media = this.store.content().placeMedia[place.id]?.value;
        const photos = mergePhotos(media?.photos ?? [], found.photos);
        const summary = media?.summary ?? found.summary;
        const added = photos.length - (media?.photos.length ?? 0);

        if (added > 0 || (summary && !media?.summary)) {
          this.store.upsert('placeMedia', { id: place.id, photos, ...(summary ? { summary } : {}) });
        }
        if (added > 0) {
          enriched++;
          p.withPhotos++;
          await this.download(found.photos.filter(f => photos.some(x => x.id === f.id)), signal);
        }
        if (summary && !media?.summary) p.withText++;
      } catch {
        if (signal.aborted) break;
        p.failed++;
        if (++failuresInARow >= GIVE_UP_AFTER) {
          this.progress.set({ ...p, state: 'offline' });
          return enriched;
        }
      }
      p.done++;
      this.progress.set({ ...p });
      await sleep(PAUSE_MS);
    }
    this.progress.set({ ...p, state: signal.aborted ? 'cancelled' : 'done' });
    return enriched;
  }

  /** One place: the lead picture of the matching article, up to two more photos taken nearby, a short text. */
  async findForPlace(place: Place, signal?: AbortSignal): Promise<{ photos: PlacePhoto[]; summary?: PlaceSummary }> {
    const ref = { name: place.name, nameLocal: place.nameLocal, lat: place.coordinates.lat, lng: place.coordinates.lng };
    const near = (lang: string) =>
      wiki(lang, `generator=geosearch&ggscoord=${ref.lat}%7C${ref.lng}&ggsradius=300&ggslimit=10&prop=coordinates%7Cpageimages%7Cextracts&piprop=thumbnail&pithumbsize=800&pilimit=max&exintro=1&explaintext=1&exsentences=2&exlimit=max&colimit=max`);

    const en = parseGeoArticles(await this.getJson(near('en'), signal));
    const article = pickArticle(en, ref);
    const photos: PlacePhoto[] = [];
    const exclude: string[] = [];

    if (article?.pageImage && article.thumb) {
      exclude.push(article.pageImage);
      const [info] = parseCommonsFiles(await this.getJson(commons(`titles=${encodeURIComponent('File:' + article.pageImage)}&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize&iiurlwidth=800`), signal));
      // a photo is only used when its author and licence are known: they have to be shown
      if (info?.license) photos.push(toPlacePhoto({ ...info, title: article.pageImage, url: article.thumb }));
    }

    const nearby = parseCommonsFiles(await this.getJson(commons(`generator=geosearch&ggsnamespace=6&ggscoord=${ref.lat}%7C${ref.lng}&ggsradius=150&ggslimit=15&prop=imageinfo%7Ccoordinates&iiprop=url%7Cextmetadata%7Csize&iiurlwidth=800&colimit=max`), signal));
    for (const f of pickExtraFiles(nearby.filter((x: CommonsFile) => !!x.license), ref, exclude)) photos.push(toPlacePhoto(f));

    // the description: Russian if Wikipedia has it, English otherwise
    let summary: PlaceSummary | undefined;
    try {
      const ru = pickArticle(parseGeoArticles(await this.getJson(near('ru'), signal)), ref, false);
      const best: { a: GeoArticle | undefined; lang: string } = ru?.extract ? { a: ru, lang: 'ru' } : { a: pickArticle(en, ref, false), lang: 'en' };
      if (best.a?.extract) {
        summary = { text: shortSummary(best.a.extract), lang: best.lang, sourceUrl: `https://${best.lang}.wikipedia.org/wiki/${encodeURIComponent(best.a.title.replace(/ /g, '_'))}` };
      }
    } catch {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    }
    return { photos, summary };
  }

  /** The picture that illustrates a city (the lead image of its Wikipedia article). */
  async findCityPhoto(city: City, signal?: AbortSignal): Promise<boolean> {
    const json: any = await this.getJson(wiki('en', `redirects=1&titles=${encodeURIComponent(city.name)}&prop=pageimages&piprop=thumbnail%7Cname&pithumbsize=1200&pilimit=1`), signal);
    const page: any = Object.values(json?.query?.pages ?? {})[0];
    const thumb: unknown = page?.thumbnail?.source;
    const pageImage: unknown = page?.pageimage;
    if (typeof thumb !== 'string' || typeof pageImage !== 'string' || /\.svg/i.test(pageImage)) return false;

    const [info] = parseCommonsFiles(await this.getJson(commons(`titles=${encodeURIComponent('File:' + pageImage)}&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize&iiurlwidth=1200`), signal));
    if (!info?.license) return false;

    const photo = toPlacePhoto({ ...info, title: pageImage, url: thumb });
    this.store.upsert('cities', { ...city, photo });
    await this.download([photo], signal);
    return true;
  }

  /**
   * Downloads the pictures that are known by address but are not stored on the device yet (e.g. after a sync).
   * `missing` is how many were needed, `stored` how many could be downloaded.
   */
  async cacheMissing(places: Place[], cities: City[], signal?: AbortSignal): Promise<{ missing: number; stored: number }> {
    const photos: PlacePhoto[] = [...places.flatMap(p => p.photos ?? []), ...cities.flatMap(c => (c.photo ? [c.photo] : []))];
    const missing: PlacePhoto[] = [];
    for (const photo of photos) if (photo.url && !missing.some(m => m.id === photo.id) && !(await this.files.has(photo.id))) missing.push(photo);
    return { missing: missing.length, stored: await this.download(missing, signal) };
  }

  private async download(photos: PlacePhoto[], signal?: AbortSignal): Promise<number> {
    let stored = 0;
    for (const photo of photos) {
      if (!photo.url || signal?.aborted) continue;
      try {
        const response = await fetch(photo.url, { signal });
        if (response.ok && (await this.files.put(photo.id, await response.blob()))) stored++;
      } catch {
        // the remote address still works while online
      }
    }
    return stored;
  }

  private async getJson(url: string, signal?: AbortSignal): Promise<unknown> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
    const onAbort = () => timeout.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      const response = await fetch(url, { signal: timeout.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
