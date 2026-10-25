import { NominatimItem, nameMatches, osmCategory, osmFields, parseOpeningHours, pickNearest } from './osm';

describe('parseOpeningHours', () => {
  it('parses 24/7', () => {
    const r = parseOpeningHours('24/7');
    expect(r.openingHours).toEqual({ from: '00:00', to: '24:00' });
    expect(r.weekdays?.length).toBe(7);
  });

  it('parses a daily range and pads the hour', () => {
    expect(parseOpeningHours('9:00-17:30').openingHours).toEqual({ from: '09:00', to: '17:30' });
  });

  it('parses day ranges and lists', () => {
    const r = parseOpeningHours('Mo-Fr,Su 10:00-18:00');
    expect(r.weekdays).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sun']);
    expect(r.openingHours).toEqual({ from: '10:00', to: '18:00' });
  });

  it('keeps complex rules as text only', () => {
    const raw = 'Mo-Fr 09:00-12:00,13:00-17:00; PH off';
    const r = parseOpeningHours(raw);
    expect(r.openingHours).toBeNull();
    expect(r.hoursText).toBe(raw);
  });
});

describe('osmCategory', () => {
  it('maps common tags', () => {
    expect(osmCategory({ category: 'amenity', type: 'place_of_worship', extratags: { religion: 'shinto' } })).toBe('shrine');
    expect(osmCategory({ category: 'amenity', type: 'place_of_worship', extratags: { religion: 'buddhist' } })).toBe('temple');
    expect(osmCategory({ category: 'tourism', type: 'museum' })).toBe('museum');
    expect(osmCategory({ category: 'tourism', type: 'attraction' })).toBe('landmark');
    expect(osmCategory({ category: 'shop', type: 'clothes' })).toBe('shopping');
    expect(osmCategory({ category: 'amenity', type: 'cafe' })).toBe('restaurant');
    expect(osmCategory({ category: 'boundary', type: 'administrative' })).toBe('other');
  });
});

describe('pickNearest', () => {
  const item = (name: string, lat: number, lon: number): NominatimItem => ({ name, lat: String(lat), lon: String(lon) });

  it('prefers the matching name over a closer unrelated object', () => {
    const items = [item('Bench', 35.0001, 139.0001), item('Ichiran Shibuya', 35.0008, 139.0008)];
    expect(pickNearest(items, 35, 139, 'Ichiran')?.name).toBe('Ichiran Shibuya');
  });

  it('ignores objects farther than the limit', () => {
    expect(pickNearest([item('Far', 35.1, 139.1)], 35, 139, 'Far')).toBeUndefined();
  });
});

describe('osmFields', () => {
  it('builds fields from a Nominatim item', () => {
    const f = osmFields({
      lat: '35.7147',
      lon: '139.7966',
      category: 'amenity',
      type: 'place_of_worship',
      name: 'Senso-ji',
      osm_type: 'way',
      osm_id: 123,
      address: { road: 'Kaminarimon-dori', city: 'Taito', postcode: '111-0032' },
      extratags: { religion: 'buddhist', opening_hours: 'Mo-Su 06:00-17:00', website: 'https://www.senso-ji.jp', wikimedia_commons: 'File:Sensoji.jpg' },
      namedetails: { name: '浅草寺', 'name:en': 'Senso-ji' },
    });
    expect(f.category).toBe('temple');
    expect(f.nameLocal).toBe('浅草寺');
    expect(f.address).toBe('Kaminarimon-dori, Taito, 111-0032');
    expect(f.osmRef).toBe('way/123');
    expect(f.parsedHours?.openingHours).toEqual({ from: '06:00', to: '17:00' });
    expect(f.commonsFile).toBe('Sensoji.jpg');
  });
});

describe('nameMatches', () => {
  it('matches by any known name, ignoring case and punctuation', () => {
    const item: NominatimItem = { lat: '0', lon: '0', name: 'Ichiran Shibuya', namedetails: { name: '一蘭 渋谷店' } };
    expect(nameMatches(item, 'ichiran')).toBe(true);
    expect(nameMatches(item, '一蘭')).toBe(true);
    expect(nameMatches(item, 'Starbucks')).toBe(false);
    expect(nameMatches(item, undefined)).toBe(false);
  });
});
