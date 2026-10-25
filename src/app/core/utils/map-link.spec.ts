import { parseMapInput } from './map-link';

describe('parseMapInput', () => {
  it('reads name and exact pin from a full place link', () => {
    const r = parseMapInput(
      'https://www.google.com/maps/place/Sens%C5%8D-ji/@35.7147651,139.7966553,17z/data=!3m1!4b1!4m6!3m5!1s0x1:0x2!8m2!3d35.7148!4d139.7967',
    );
    expect(r.kind).toBe('google');
    expect(r.name).toBe('Sensō-ji');
    expect(r.lat).toBe(35.7148);
    expect(r.lng).toBe(139.7967);
  });

  it('falls back to the map centre when there is no pin', () => {
    const r = parseMapInput('google.com/maps/place/Foo+Bar/@35.5,139.5,15z');
    expect(r.name).toBe('Foo Bar');
    expect(r.lat).toBe(35.5);
    expect(r.lng).toBe(139.5);
  });

  it('reads coordinates from ?q=', () => {
    const r = parseMapInput('https://www.google.com/maps?q=35.6595,139.7005');
    expect(r.lat).toBe(35.6595);
    expect(r.name).toBeUndefined();
  });

  it('reads a name-only search link', () => {
    const r = parseMapInput('https://www.google.com/maps/search/?api=1&query=Ichiran+Shibuya');
    expect(r.name).toBe('Ichiran Shibuya');
    expect(r.lat).toBeUndefined();
  });

  it('reports short links', () => {
    expect(parseMapInput('https://maps.app.goo.gl/AbCdEf123').kind).toBe('short');
  });

  it('accepts plain coordinates', () => {
    const r = parseMapInput('35.6595, 139.7005');
    expect(r).toEqual({ kind: 'coords', lat: 35.6595, lng: 139.7005 });
  });

  it('rejects unrelated links and out-of-range numbers', () => {
    expect(parseMapInput('https://example.com/a').kind).toBe('unknown');
    expect(parseMapInput('google.com/maps/@95.0,200.0,10z').lat).toBeUndefined();
    expect(parseMapInput('').kind).toBe('unknown');
  });
});
