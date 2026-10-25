import { HourSample } from './fuji';
import { climateDay, forecastDay, groupByDate, parseHourly } from './weather-aggregate';
import { dominantCode, weatherInfo } from './weather-codes';

const hours = (over: Partial<HourSample> = {}, date = '2026-12-03'): HourSample[] =>
  Array.from({ length: 24 }, (_, h) => ({ date, hour: h, temp: 5 + h / 4, rh: 40, precip: 0, code: 0, wind: 10 + h, low: 0, mid: 0, high: 0, ...over }));

describe('parseHourly', () => {
  it('parses an Open-Meteo hourly response and skips hours without cloud data', () => {
    const json = { hourly: {
      time: ['2026-12-03T06:00', '2026-12-03T07:00', '2026-12-03T08:00'],
      temperature_2m: [3.2, 4, 5], relative_humidity_2m: [60, 55, 50], precipitation: [0, 0.2, 0], weather_code: [1, 61, 2], wind_speed_10m: [5, 6, 7],
      cloud_cover_low: [10, 20, null], cloud_cover_mid: [30, 40, 50], cloud_cover_high: [0, 5, 10], visibility: [24000, 18000, 20000],
    } };
    const r = parseHourly(json);
    expect(r.length).toBe(2);
    expect(r[0]).toEqual({ date: '2026-12-03', hour: 6, temp: 3.2, rh: 60, precip: 0, code: 1, wind: 5, low: 10, mid: 30, high: 0, visKm: 24 });
    expect(r[1].precip).toBe(0.2);
  });

  it('survives garbage', () => {
    expect(parseHourly(null)).toEqual([]);
    expect(parseHourly({ hourly: {} })).toEqual([]);
  });

  it('groups by date', () => {
    const g = groupByDate([...hours({}, '2026-12-01'), ...hours({}, '2026-12-02')]);
    expect(Object.keys(g)).toEqual(['2026-12-01', '2026-12-02']);
    expect(g['2026-12-01'].length).toBe(24);
  });
});

describe('forecastDay', () => {
  it('summarises temperature, precipitation, wind and fuji', () => {
    const obs = hours({ precip: 0.1 });
    const r = forecastDay(obs, hours(), 100)!;
    expect(r.source).toBe('forecast');
    expect(r.tempMin).toBe(5);
    expect(r.tempMax).toBe(11);
    expect(r.precipMm).toBe(2.4);
    expect(r.windMax).toBe(33);
    expect(r.fuji).not.toBeNull();
  });

  it('returns null when there is no data', () => {
    expect(forecastDay([], [], 10)).toBeNull();
  });
});

describe('climateDay', () => {
  const clear = { obs: hours(), summit: hours() };
  const rainy = { obs: hours({ precip: 0.5, code: 63, low: 100, mid: 100 }), summit: hours({ mid: 100 }) };

  it('aggregates several years: shares, median and averages', () => {
    const r = climateDay([clear, clear, rainy, clear, rainy], 17)!;
    expect(r.source).toBe('climate');
    expect(r.years).toBe(5);
    expect(r.wetShare).toBeCloseTo(0.4);
    expect(r.fujiGoodShare).toBeCloseTo(0.6);
    expect(r.fujiMedian).toBeGreaterThanOrEqual(90);
  });

  it('ignores years without data and returns null if none', () => {
    expect(climateDay([{ obs: [], summit: [] }, clear], 17)!.years).toBe(1);
    expect(climateDay([], 17)).toBeNull();
  });
});

describe('weather codes', () => {
  it('picks significant weather over cloud cover and the commonest otherwise', () => {
    expect(dominantCode([0, 0, 2, 61, 61, 3])).toBe(61);
    expect(dominantCode([0, 1, 1, 2, 3])).toBe(1);
    expect(dominantCode([2, 2, 61])).toBe(2); // a single drizzle hour does not define the day
    expect(dominantCode([1, 95])).toBe(95);
    expect(dominantCode([])).toBe(0);
  });

  it('describes codes in Russian', () => {
    expect(weatherInfo(0).label).toBe('Ясно');
    expect(weatherInfo(63).icon).toBe('🌧️');
    expect(weatherInfo(73).label).toBe('Снег');
  });
});
