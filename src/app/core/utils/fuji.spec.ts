import { HourSample, fujiDayScore, fujiHourScore, fujiLabel } from './fuji';

const hour = (over: Partial<HourSample> = {}, h = 8): HourSample => ({
  date: '2026-12-03', hour: h, temp: 8, rh: 40, precip: 0, code: 0, wind: 10, low: 0, mid: 0, high: 0, visKm: 30, ...over,
});
const day = (over: Partial<HourSample> = {}, byHour: Record<number, Partial<HourSample>> = {}) =>
  Array.from({ length: 24 }, (_, h) => hour({ ...over, ...(byHour[h] ?? {}) }, h));

describe('fujiHourScore', () => {
  it('is near 100 on a clear dry day, even from Tokyo', () => {
    expect(fujiHourScore(hour(), hour(), 100)).toBeGreaterThanOrEqual(95);
    expect(fujiHourScore(hour(), hour(), 17)).toBe(100);
  });

  it('drops hard when mid clouds cover the summit', () => {
    expect(fujiHourScore(hour(), hour({ mid: 100 }), 17)).toBeLessThanOrEqual(25);
  });

  it('drops hard with low clouds at the observer', () => {
    expect(fujiHourScore(hour({ low: 100 }), hour(), 17)).toBeLessThanOrEqual(45);
  });

  it('high clouds alone barely matter', () => {
    expect(fujiHourScore(hour({ high: 100 }), hour({ high: 100 }), 17)).toBeGreaterThanOrEqual(90);
  });

  it('rain and fog are bad', () => {
    expect(fujiHourScore(hour({ precip: 1, code: 61 }), hour(), 17)).toBeLessThanOrEqual(50);
    expect(fujiHourScore(hour({ code: 45 }), hour(), 17)).toBeLessThanOrEqual(50);
  });

  it('humid haze hurts more from far away', () => {
    const humid = hour({ rh: 95 });
    expect(fujiHourScore(humid, hour(), 100)).toBeLessThan(fujiHourScore(humid, hour(), 10));
  });

  it('low visibility only counts when it is known', () => {
    const hazy = fujiHourScore(hour({ visKm: 3 }), hour(), 100);
    const unknown = fujiHourScore(hour({ visKm: undefined }), hour(), 100);
    expect(hazy).toBeLessThan(unknown);
  });

  it('stays within 0..100', () => {
    const worst = hour({ low: 100, mid: 100, high: 100, rh: 100, precip: 20, code: 95, visKm: 0 });
    expect(fujiHourScore(worst, worst, 100)).toBe(0);
  });
});

describe('fujiDayScore', () => {
  it('finds the best 3-hour window: a clear morning saves a cloudy day', () => {
    const cloudy = { low: 100 };
    const obs = day(cloudy, { 7: { low: 0 }, 8: { low: 0 }, 9: { low: 0 } });
    const r = fujiDayScore(obs, day(), 17)!;
    expect(r.best).toEqual({ from: 7, to: 10 });
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.label).toBe('excellent');
  });

  it('reports an overcast day as unlikely and explains the factors', () => {
    const r = fujiDayScore(day({ low: 90, mid: 90, rh: 85 }), day({ mid: 90 }), 100)!;
    expect(r.label).toBe('unlikely');
    expect(r.factors.humidity).toBe(85);
    expect(r.factors.midCloud).toBeGreaterThan(80);
  });

  it('returns hourly scores for daylight hours only', () => {
    const r = fujiDayScore(day(), day(), 17)!;
    expect(r.hours[0].hour).toBe(6);
    expect(r.hours[r.hours.length - 1].hour).toBe(17);
  });

  it('returns null without enough data', () => {
    expect(fujiDayScore([], [], 17)).toBeNull();
    expect(fujiDayScore(day().slice(0, 7), day().slice(0, 7), 17)).toBeNull();
  });

  it('maps scores to labels at the thresholds', () => {
    expect([74, 75, 54, 55, 34, 35].map(fujiLabel)).toEqual(['good', 'excellent', 'possible', 'good', 'unlikely', 'possible']);
  });
});
