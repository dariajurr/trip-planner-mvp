import { estimateTravelMin, formatClock, layoutDay, parseClock, partOfDay, segmentDays } from './day-timeline';
import { defaultTimezone } from '../data/countries';
import { sunTimes, sunMinutesUtc, zoneOffsetMinutes } from './sun-times';

const minutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

describe('sunTimes', () => {
  it('matches Tokyo on 2 December (the reference: sunrise 6:33, sunset 16:28)', () => {
    const t = sunTimes('2026-12-02', 35.6762, 139.6503, 'Asia/Tokyo')!;
    expect(Math.abs(minutes(t.sunrise) - minutes('6:33'))).toBeLessThanOrEqual(2);
    expect(Math.abs(minutes(t.sunset) - minutes('16:28'))).toBeLessThanOrEqual(2);
  });

  it('days are long in summer, short in winter, and about 12 hours at the equator', () => {
    const len = (d: string, lat: number, lng: number) => { const s = sunMinutesUtc(d, lat, lng)!; return s.set - s.rise; };
    expect(len('2026-06-21', 50.1, 8.7)).toBeGreaterThan(len('2026-12-21', 50.1, 8.7) + 6 * 60);
    expect(Math.abs(len('2026-03-20', 0, 30) - 12 * 60)).toBeLessThan(15);
  });

  it('knows daylight saving time', () => {
    expect(zoneOffsetMinutes('2026-07-01', 'Europe/Berlin')).toBe(120);
    expect(zoneOffsetMinutes('2026-12-01', 'Europe/Berlin')).toBe(60);
    expect(zoneOffsetMinutes('2026-12-01', 'Not/AZone')).toBeNull();
  });

  it('falls back to solar time for an unknown zone, and returns null in polar night and polar day', () => {
    expect(sunTimes('2026-12-02', 35.68, 139.65, 'Not/AZone')).not.toBeNull();
    expect(sunTimes('2026-12-21', 78.2, 15.6, 'Arctic/Longyearbyen')).toBeNull();
    expect(sunTimes('2026-06-21', 78.2, 15.6, 'Arctic/Longyearbyen')).toBeNull();
  });
});

describe('time zone for a new city', () => {
  it('by country when it has one zone, otherwise by longitude', () => {
    expect(defaultTimezone('VN', 109.2)).toBe('Asia/Ho_Chi_Minh');
    expect(defaultTimezone('US', -118.2)).toBe('Etc/GMT+8');
    expect(defaultTimezone(undefined, 139.7)).toBe('Etc/GMT-9');
    expect(defaultTimezone(undefined, 3)).toBe('Etc/UTC');
    expect(defaultTimezone('US', undefined)).toBeUndefined();
    expect(zoneOffsetMinutes('2026-12-01', 'Etc/GMT-9')).toBe(540);
  });
});

describe('day timeline', () => {
  it('names the part of the day', () => {
    expect(partOfDay(minutes('09:00'))).toBe('morning');
    expect(partOfDay(minutes('12:00'))).toBe('day');
    expect(partOfDay(minutes('16:59'))).toBe('day');
    expect(partOfDay(minutes('17:00'))).toBe('evening');
  });

  it('lays stops one after another with travel between them, announcing a part only when it changes', () => {
    const slots = layoutDay([{ durationMin: 180, travelToNextMin: 20 }, { durationMin: 150, travelToNextMin: 15 }, { durationMin: 60, travelToNextMin: 30 }, { durationMin: 90, travelToNextMin: 0 }], minutes('09:00'));
    expect(slots.map(s => [s.start, s.end])).toEqual([[540, 720], [740, 890], [905, 965], [995, 1085]]);
    expect(slots.map(s => s.part)).toEqual(['morning', 'day', 'day', 'day']);
    expect(slots.map(s => s.announce)).toEqual([true, true, false, false]);
  });

  it('formats and parses clock times', () => {
    expect(formatClock(545)).toBe('09:05');
    expect(formatClock(1500)).toBe('01:00');
    expect(parseClock('10:30', 0)).toBe(630);
    expect(parseClock(undefined, 540)).toBe(540);
    expect(parseClock('late', 540)).toBe(540);
  });

  it('estimates travel: on foot when close, by train when far', () => {
    expect(estimateTravelMin(0.3)).toBe(5);
    expect(estimateTravelMin(1.0)).toBe(15);
    expect(estimateTravelMin(5)).toBe(25);
    expect(estimateTravelMin(30)).toBe(95);
  });

  it('groups consecutive days of the same city, ignoring days with no known city', () => {
    const s = segmentDays([{ date: '12-02', cityId: 'tokyo' }, { date: '12-03', cityId: 'tokyo' }, { date: '12-04', cityId: undefined }, { date: '12-05', cityId: 'kamakura' }, { date: '12-06', cityId: 'tokyo' }]);
    expect(s).toEqual([{ cityId: 'tokyo', from: '12-02', to: '12-03', days: 2 }, { cityId: 'kamakura', from: '12-05', to: '12-05', days: 1 }, { cityId: 'tokyo', from: '12-06', to: '12-06', days: 1 }]);
  });
});
