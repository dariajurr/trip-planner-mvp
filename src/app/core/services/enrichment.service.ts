import { Injectable } from '@angular/core';

import {
  CommonsImage,
  parseCommonsImageInfo,
  parsePageImageName,
  parseWikidataImageName,
  splitWikipediaTag,
} from '../utils/commons';
import { haversineMeters } from '../utils/geo';
import { NominatimItem, OsmFields, nameMatches, osmFields, pickNearest } from '../utils/osm';

export interface EnrichmentInput {
  name?: string;
  lat: number;
  lng: number;
}

export interface EnrichmentResult {
  /** Fields from the matching OpenStreetMap object (or only the address when the object is not identified). */
  osm?: OsmFields;
  /** True when a named OSM object was identified, false when only an address was found. */
  matched: boolean;
  photo?: CommonsImage;
  /** Local copy of the photo for offline use, when it could be downloaded. */
  photoBlob?: Blob;
  messages: string[];
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const TIMEOUT_MS = 8000;
const NOMINATIM_GAP_MS = 1100; // usage policy: at most one request per second

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fills in what can be taken from open sources: OpenStreetMap (address, hours, website, category)
 * and Wikimedia Commons (a photo with author and license). Every step is best effort:
 * a failure only adds a message, it never throws.
 */
@Injectable({ providedIn: 'root' })
export class EnrichmentService {
  async enrich(input: EnrichmentInput): Promise<EnrichmentResult> {
    const result: EnrichmentResult = { matched: false, messages: [] };

    try {
      const item = await this.findOsmObject(input, result);
      if (item) {
        result.osm = osmFields(item);
        result.matched = result.matched || !!item.name;
      }
    } catch {
      result.messages.push('OpenStreetMap сейчас недоступен. Можно заполнить поля вручную.');
      return result;
    }

    if (result.osm && result.matched) {
      await this.findPhoto(result.osm, result);
    }
    if (!result.osm) {
      result.messages.push('В OpenStreetMap это место не найдено. Заполните поля вручную.');
    }
    return result;
  }

  private async findOsmObject(input: EnrichmentInput, result: EnrichmentResult): Promise<NominatimItem | undefined> {
    const { lat, lng, name } = input;
    const common = 'format=jsonv2&addressdetails=1&extratags=1&namedetails=1&accept-language=en';

    if (name) {
      const d = 0.004;
      const viewbox = `${lng - d},${lat + d},${lng + d},${lat - d}`;
      const items = await this.getJson<NominatimItem[]>(
        `${NOMINATIM}/search?${common}&q=${encodeURIComponent(name)}&viewbox=${viewbox}&bounded=1&limit=5`,
      );
      const hit = Array.isArray(items) ? pickNearest(items, lat, lng, name, 250) : undefined;
      if (hit) {
        result.matched = true;
        return hit;
      }
      await sleep(NOMINATIM_GAP_MS);
    }

    const reverse = await this.getJson<NominatimItem>(`${NOMINATIM}/reverse?${common}&lat=${lat}&lon=${lng}&zoom=18`);
    if (!reverse || !reverse.lat) {
      return undefined;
    }
    const distance = haversineMeters(lat, lng, Number(reverse.lat), Number(reverse.lon));
    const identified = name
      ? nameMatches(reverse, name) && distance <= 120
      : !!reverse.name && distance <= 50;
    if (identified) {
      result.matched = true;
      return reverse;
    }
    result.messages.push('Нашёл адрес, но само место в OpenStreetMap не опознано.');
    return { ...reverse, name: undefined, extratags: undefined, namedetails: undefined };
  }

  private async findPhoto(osm: OsmFields, result: EnrichmentResult): Promise<void> {
    try {
      let file = osm.commonsFile;

      if (!file && osm.wikipedia) {
        const tag = splitWikipediaTag(osm.wikipedia);
        if (tag) {
          const json = await this.getJson(
            `https://${tag.lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(tag.title)}&prop=pageimages&piprop=name&format=json&origin=*`,
          );
          file = parsePageImageName(json);
        }
      }
      if (!file && osm.wikidata && /^Q\d+$/.test(osm.wikidata)) {
        const json = await this.getJson(
          `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${osm.wikidata}&property=P18&format=json&origin=*`,
        );
        file = parseWikidataImageName(json);
      }
      if (!file) {
        return;
      }

      const info = parseCommonsImageInfo(
        await this.getJson(
          `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent('File:' + file)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&format=json&origin=*`,
        ),
      );
      if (!info) {
        return;
      }
      result.photo = info;

      try {
        const response = await this.fetchWithTimeout(info.url);
        if (response.ok) {
          result.photoBlob = await response.blob();
        }
      } catch {
        // the remote URL still works while online
      }
    } catch {
      result.messages.push('Фото из Wikimedia Commons найти не удалось.');
    }
  }

  private async getJson<T = unknown>(url: string): Promise<T | undefined> {
    const response = await this.fetchWithTimeout(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
