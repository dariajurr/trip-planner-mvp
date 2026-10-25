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
