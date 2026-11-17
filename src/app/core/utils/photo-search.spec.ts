import { CommonsFile, GeoArticle, mergePhotos, nameScore, nameTokens, parseCommonsFiles, parseGeoArticles, photoId, pickArticle, pickExtraFiles, toPlacePhoto } from './photo-search';

const SENSOJI = { name: 'Senso-ji', nameLocal: '浅草寺', lat: 35.7148, lng: 139.7967 };
const art = (title: string, dLat = 0, over: Partial<GeoArticle> = {}): GeoArticle => ({ title, lat: SENSOJI.lat + dLat, lng: SENSOJI.lng, thumb: `https://upload.wikimedia.org/${title}.jpg`, pageImage: `${title}.jpg`, ...over });
const file = (title: string, dLat = 0, over: Partial<CommonsFile> = {}): CommonsFile => ({ title, url: `https://upload.wikimedia.org/thumb/${title}`, width: 4000, lat: SENSOJI.lat + dLat, lng: SENSOJI.lng, ...over });

describe('parseGeoArticles / parseCommonsFiles', () => {
  it('reads Wikipedia geosearch pages, skipping those without coordinates', () => {
    const json = { query: { pages: {
      '1': { title: 'Sensō-ji', coordinates: [{ lat: 35.7147, lon: 139.7966 }], thumbnail: { source: 'https://x/t.jpg' }, pageimage: 'Sensoji.jpg', extract: ' Sensō-ji is a Buddhist temple. ' },
      '2': { title: 'No coordinates' },
    } } };
    expect(parseGeoArticles(json)).toEqual([{ title: 'Sensō-ji', lat: 35.7147, lng: 139.7966, thumb: 'https://x/t.jpg', pageImage: 'Sensoji.jpg', extract: 'Sensō-ji is a Buddhist temple.' }]);
    expect(parseGeoArticles(null)).toEqual([]);
  });

  it('reads Commons files with author, licence and position', () => {
    const json = { query: { pages: { '9': { title: 'File:Hondo.jpg', coordinates: [{ lat: 35.71, lon: 139.79 }], imageinfo: [{
      thumburl: 'https://x/800px-Hondo.jpg', width: 4000, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Hondo.jpg',
      extmetadata: { Artist: { value: '<a href="u">Jane Doe</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] } } } };
    expect(parseCommonsFiles(json)).toEqual([{ title: 'Hondo.jpg', url: 'https://x/800px-Hondo.jpg', width: 4000, credit: 'Jane Doe', license: 'CC BY-SA 4.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Hondo.jpg', lat: 35.71, lng: 139.79 }]);
    expect(parseCommonsFiles({ query: { pages: { '1': { title: 'File:x.jpg' } } } })).toEqual([]);
  });
});

describe('name matching', () => {
  it('ignores accents, case, punctuation and filler words', () => {
    expect(nameTokens('Sensō-ji Temple of the Tokyo')).toEqual(['senso', 'ji', 'temple']);
    expect(nameTokens('浅草寺 (Asakusa)')).toEqual(['浅草寺', 'asakusa']);
  });

  it('scores containment, so a longer or shorter variant still matches', () => {
    expect(nameScore('Sensō-ji', ['Senso-ji'])).toBe(1);
    expect(nameScore('Sensō-ji', ['Senso-ji Main Hall'])).toBe(1);
    expect(nameScore('浅草寺', ['Senso-ji', '浅草寺'])).toBe(1);
    expect(nameScore('Tokyo Skytree', ['Senso-ji'])).toBe(0);
    expect(nameScore('', ['Senso-ji'])).toBe(0);
  });
});

describe('pickArticle', () => {
  it('takes the article with the matching name even if another one is closer', () => {
    expect(pickArticle([art('Asakusa Shrine', 0.0002), art('Sensō-ji', 0.0005)], SENSOJI)?.title).toBe('Sensō-ji');
  });

  it('accepts an unrelated name only when it is right at the spot', () => {
    expect(pickArticle([art('Hōzōmon', 0.0002)], SENSOJI)?.title).toBe('Hōzōmon'); // ~22 m
    expect(pickArticle([art('Some Hotel', 0.002)], SENSOJI)).toBeUndefined(); // ~220 m, different name
  });

  it('rejects a matching name that is far away, articles without a picture, and maps or logos', () => {
    expect(pickArticle([art('Sensō-ji', 0.02)], SENSOJI)).toBeUndefined();
    expect(pickArticle([art('Sensō-ji', 0, { thumb: undefined })], SENSOJI)).toBeUndefined();
    expect(pickArticle([art('Sensō-ji', 0, { pageImage: 'Sensoji map.svg' })], SENSOJI)).toBeUndefined();
  });
});

describe('pickArticle for text only', () => {
  it('does not need a picture when only the summary is wanted', () => {
    const noPic = art('Sensō-ji', 0, { thumb: undefined, pageImage: undefined, extract: 'A temple.' });
    expect(pickArticle([noPic], SENSOJI)).toBeUndefined();
    expect(pickArticle([noPic], SENSOJI, false)?.extract).toBe('A temple.');
  });
});

describe('pickExtraFiles', () => {
  it('keeps real photos nearby, best name match first, no duplicates of the main photo', () => {
    const files = [
      file('Random street.jpg', 0.0003), file('Senso-ji at night.jpg', 0.0008), file('Sensoji map.png', 0), file('Senso-ji logo.svg', 0),
      file('Small senso-ji.jpg', 0, { width: 300 }), file('Far senso-ji.jpg', 0.01), file('Main photo.jpg', 0),
    ];
    expect(pickExtraFiles(files, SENSOJI, ['File:Main photo.jpg']).map(f => f.title)).toEqual(['Senso-ji at night.jpg', 'Random street.jpg']);
  });

  it('respects the limit and ignores files without a position', () => {
    expect(pickExtraFiles([file('a.jpg'), file('b.jpg'), file('c.jpg')], SENSOJI, [], 1).length).toBe(1);
    expect(pickExtraFiles([file('a.jpg', 0, { lat: undefined, lng: undefined })], SENSOJI, [])).toEqual([]);
  });
});

describe('ids and merging', () => {
  it('the same file always gets the same id, whatever the spelling of the prefix or case', () => {
    expect(photoId('File:Hondo.jpg')).toBe(photoId('hondo.JPG'));
    expect(photoId('a.jpg')).not.toBe(photoId('b.jpg'));
    expect(photoId('a.jpg').startsWith('wm-')).toBe(true);
  });

  it('builds a photo with credit and a readable caption', () => {
    expect(toPlacePhoto({ title: 'Senso-ji_at_night.jpg', url: 'https://x', credit: 'Jane', license: 'CC BY 4.0', sourceUrl: 'https://c' })).toEqual(jasmine.objectContaining({ source: 'commons', caption: 'Senso-ji at night', credit: 'Jane', license: 'CC BY 4.0', sourceUrl: 'https://c' }));
  });

  it('keeps existing photos, adds new ones once, and caps the total', () => {
    const p = (id: string) => ({ id, source: 'commons' as const });
    expect(mergePhotos([p('a')], [p('a'), p('b')]).map(x => x.id)).toEqual(['a', 'b']);
    expect(mergePhotos([p('1'), p('2'), p('3'), p('4'), p('5')], [p('6'), p('7')]).length).toBe(6);
  });
});
