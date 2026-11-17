import { Place, PlaceMedia } from '../models';
import { withMedia } from './place-media';

const place = (over: Partial<Place> = {}): Place => ({
  id: 'p', name: 'Senso-ji', category: 'temple', priority: 'must', areaId: 'asakusa',
  coordinates: { lat: 35.7, lng: 139.8 }, schedule: { weekdays: null, openingHours: null }, ...over,
});
const photo = (id: string) => ({ id, source: 'commons' as const, url: `https://x/${id}.jpg` });

describe('withMedia', () => {
  it('returns the very same place when nothing was found', () => {
    const p = place();
    expect(withMedia(p, undefined)).toBe(p);
    expect(withMedia(p, { id: 'p', photos: [] })).toBe(p);
  });

  it('adds found photos after the place\'s own, without duplicates', () => {
    const own = place({ photos: [photo('a')] });
    const media: PlaceMedia = { id: 'p', photos: [photo('a'), photo('b')] };
    expect(withMedia(own, media).photos?.map(p => p.id)).toEqual(['a', 'b']);
  });

  it('uses the found summary only when the place has no description of its own, and says where it is from', () => {
    const media: PlaceMedia = { id: 'p', photos: [], summary: { text: 'A temple.', lang: 'en', sourceUrl: 'https://en.wikipedia.org/wiki/X' } };
    const merged = withMedia(place(), media);
    expect(merged.description).toBe('A temple.');
    expect(merged.descriptionCredit).toEqual({ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/X' });
    const own = withMedia(place({ description: 'My note' }), media);
    expect(own.description).toBe('My note');
    expect(own.descriptionCredit).toBeUndefined();
    expect(withMedia(place(), { ...media, summary: { text: 'Храм.', lang: 'ru' } }).descriptionCredit?.label).toBe('Википедия');
  });

  it('does not change the original place', () => {
    const p = place();
    withMedia(p, { id: 'p', photos: [photo('a')] });
    expect(p.photos).toBeUndefined();
  });
});
