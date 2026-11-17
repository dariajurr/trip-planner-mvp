/**
 * A photo attached to a place.
 * - 'user': taken/uploaded by the user, the compressed image lives in IndexedDB under `id`.
 * - 'commons': found on Wikimedia Commons; `url` is the remote thumbnail, a local copy
 *   is stored in IndexedDB when possible so it works offline. Credit + license are required.
 */
export interface PlacePhoto {
  id: string;
  source: 'user' | 'commons';
  url?: string;
  caption?: string;
  credit?: string;
  license?: string;
  sourceUrl?: string;
}

/** A short text about a place taken from an open source (Wikipedia, CC BY-SA). */
export interface PlaceSummary {
  text: string;
  lang: string;
  sourceUrl?: string;
}

/**
 * Photos and text found for a place, kept apart from the place itself so that a catalog place
 * does not have to be copied just to get pictures. `id` is the place id.
 */
export interface PlaceMedia {
  id: string;
  photos: PlacePhoto[];
  summary?: PlaceSummary;
}
