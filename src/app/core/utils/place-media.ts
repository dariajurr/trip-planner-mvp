import { Place, PlaceMedia } from '../models';

/**
 * The place as it is shown: its own photos plus the ones found for it (no duplicates), and the
 * found summary when the place has no description of its own.
 */
export function withMedia(place: Place, media: PlaceMedia | null | undefined): Place {
  if (!media || (!media.photos.length && !media.summary)) return place;

  const photos = [...(place.photos ?? [])];
  for (const photo of media.photos) {
    if (!photos.some(p => p.id === photo.id)) photos.push(photo);
  }

  const merged: Place = { ...place };
  if (photos.length) merged.photos = photos;
  if (!place.description && media.summary?.text) {
    merged.description = media.summary.text;
    merged.descriptionCredit = { label: media.summary.lang === 'ru' ? 'Википедия' : 'Wikipedia', url: media.summary.sourceUrl };
  }
  return merged;
}
