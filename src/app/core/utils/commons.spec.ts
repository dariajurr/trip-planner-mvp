import { parseCommonsImageInfo, parsePageImageName, parseWikidataImageName, splitWikipediaTag, stripHtml } from './commons';

describe('commons helpers', () => {
  it('strips html and entities', () => {
    expect(stripHtml('<a href="x">Jane &amp; Co</a>')).toBe('Jane & Co');
    expect(stripHtml(undefined)).toBeUndefined();
  });

  it('parses imageinfo with credit and license', () => {
    const r = parseCommonsImageInfo({
      query: { pages: { '1': { title: 'File:Sensoji.jpg', imageinfo: [{
        thumburl: 'https://upload.wikimedia.org/thumb/x.jpg',
        url: 'https://upload.wikimedia.org/x.jpg',
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Sensoji.jpg',
        extmetadata: { Artist: { value: '<a href="u">Jane Doe</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } },
      }] } } },
    });
    expect(r).toEqual({
      url: 'https://upload.wikimedia.org/thumb/x.jpg',
      credit: 'Jane Doe',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Sensoji.jpg',
      title: 'Sensoji.jpg',
    });
  });

  it('returns undefined for malformed input', () => {
    expect(parseCommonsImageInfo(null)).toBeUndefined();
    expect(parseCommonsImageInfo({ query: { pages: { '-1': { missing: '' } } } })).toBeUndefined();
    expect(parsePageImageName({})).toBeUndefined();
    expect(parseWikidataImageName({ claims: {} })).toBeUndefined();
  });

  it('reads page image and wikidata image names', () => {
    expect(parsePageImageName({ query: { pages: { '5': { pageimage: 'A.jpg' } } } })).toBe('A.jpg');
    expect(parseWikidataImageName({ claims: { P18: [{ mainsnak: { datavalue: { value: 'B.jpg' } } }] } })).toBe('B.jpg');
  });

  it('splits wikipedia tags', () => {
    expect(splitWikipediaTag('ja:浅草寺')).toEqual({ lang: 'ja', title: '浅草寺' });
    expect(splitWikipediaTag('nonsense')).toBeUndefined();
  });
});
