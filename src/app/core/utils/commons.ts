/** Helpers for reading Wikimedia API responses. All inputs are untrusted JSON. */

export interface CommonsImage {
  /** Remote thumbnail URL. */
  url: string;
  credit?: string;
  license?: string;
  /** The file description page on Commons. */
  sourceUrl?: string;
  title?: string;
}

export function stripHtml(html: string | undefined): string | undefined {
  if (!html) {
    return undefined;
  }
  const text = html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
  return text || undefined;
}

/** Parses action=query&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=N. */
export function parseCommonsImageInfo(json: any): CommonsImage | undefined {
  const pages = json?.query?.pages;
  if (!pages || typeof pages !== 'object') {
    return undefined;
  }
  const page: any = Object.values(pages)[0];
  const info = page?.imageinfo?.[0];
  const url: string | undefined = info?.thumburl ?? info?.url;
  if (!url) {
    return undefined;
  }
  const meta = info.extmetadata ?? {};
  return {
    url,
    credit: stripHtml(meta.Artist?.value) ?? stripHtml(meta.Credit?.value),
    license: stripHtml(meta.LicenseShortName?.value),
    sourceUrl: info.descriptionurl,
    title: typeof page.title === 'string' ? page.title.replace(/^File:/i, '') : undefined,
  };
}

/** Parses action=query&prop=pageimages&piprop=name → the lead image file name of a Wikipedia article. */
export function parsePageImageName(json: any): string | undefined {
  const pages = json?.query?.pages;
  const page: any = pages && typeof pages === 'object' ? Object.values(pages)[0] : undefined;
  return typeof page?.pageimage === 'string' ? page.pageimage : undefined;
}

/** Parses wbgetclaims P18 (image) → file name. */
export function parseWikidataImageName(json: any): string | undefined {
  const value = json?.claims?.['P18']?.[0]?.mainsnak?.datavalue?.value;
  return typeof value === 'string' ? value : undefined;
}

/** "en:Senso-ji" → { lang: 'en', title: 'Senso-ji' }. */
export function splitWikipediaTag(tag: string | undefined): { lang: string; title: string } | undefined {
  const m = /^([a-z\-]{2,12}):(.+)$/i.exec(tag ?? '');
  return m ? { lang: m[1].toLowerCase(), title: m[2].trim() } : undefined;
}
