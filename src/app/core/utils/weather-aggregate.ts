import { FujiDayScore, HourSample, fujiDayScore } from './fuji';
import { dominantCode } from './weather-codes';

export interface DayBase {
  tempMin: number;
  tempMax: number;
  precipMm: number;
}

export interface ForecastDay extends DayBase {
  source: 'forecast';
  windMax: number;
  code: number;
  fuji: FujiDayScore | null;
}

/** What the same calendar day was like in previous years. */
export interface ClimateDay extends DayBase {
  source: 'climate';
  /** Share of years with noticeable precipitation (>= 1 mm). */
  wetShare: number;
  years: number;
  fujiMedian: number | null;
  /** Share of years in which Fuji would likely have been visible (score >= 55). */
  fujiGoodShare: number | null;
}

export type DayEntry = ForecastDay | ClimateDay;

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const round1 = (x: number) => Math.round(x * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Parses an Open-Meteo hourly response (timezone=auto) into samples. Hours without cloud data are skipped. */
export function parseHourly(json: any): HourSample[] {
  const h = json?.hourly;
  if (!h || !Array.isArray(h.time)) return [];

  const out: HourSample[] = [];
  h.time.forEach((time: string, i: number) => {
    const low = h.cloud_cover_low?.[i];
    const mid = h.cloud_cover_mid?.[i];
    if (typeof time !== 'string' || typeof low !== 'number' || typeof mid !== 'number') return;

    const vis = h.visibility?.[i];
    out.push({
      date: time.slice(0, 10),
      hour: Number(time.slice(11, 13)),
      temp: num(h.temperature_2m?.[i]),
      rh: num(h.relative_humidity_2m?.[i], 50),
      precip: num(h.precipitation?.[i]),
      code: num(h.weather_code?.[i]),
      wind: num(h.wind_speed_10m?.[i]),
      low,
      mid,
      high: num(h.cloud_cover_high?.[i]),
      ...(typeof vis === 'number' ? { visKm: vis / 1000 } : {}),
    });
  });
  return out;
}

export function groupByDate(hours: HourSample[]): Record<string, HourSample[]> {
  const out: Record<string, HourSample[]> = {};
  for (const h of hours) (out[h.date] ??= []).push(h);
  return out;
}

function base(hours: HourSample[]): DayBase {
  const temps = hours.map(h => h.temp);
  return {
    tempMin: Math.round(Math.min(...temps)),
    tempMax: Math.round(Math.max(...temps)),
    precipMm: round1(hours.reduce((sum, h) => sum + h.precip, 0)),
  };
}

export function forecastDay(obs: HourSample[], summit: HourSample[], distanceKm: number): ForecastDay | null {
  if (!obs.length) return null;
  const daytime = obs.filter(h => h.hour >= 6 && h.hour <= 18).map(h => h.code);
  return {
    source: 'forecast',
    ...base(obs),
    windMax: Math.round(Math.max(...obs.map(h => h.wind))),
    code: dominantCode(daytime.length ? daytime : obs.map(h => h.code)),
    fuji: fujiDayScore(obs, summit, distanceKm),
  };
}

export function climateDay(
  years: { obs: HourSample[]; summit: HourSample[] }[],
  distanceKm: number,
): ClimateDay | null {
  const usable = years.filter(y => y.obs.length);
  if (!usable.length) return null;

  const bases = usable.map(y => base(y.obs));
  const scores = usable
    .map(y => fujiDayScore(y.obs, y.summit, distanceKm)?.score)
    .filter((s): s is number => typeof s === 'number')
    .sort((a, b) => a - b);

  const median = scores.length
    ? scores.length % 2
      ? scores[(scores.length - 1) / 2]
      : Math.round((scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2)
    : null;

  return {
    source: 'climate',
    tempMin: Math.round(avg(bases.map(b => b.tempMin))),
    tempMax: Math.round(avg(bases.map(b => b.tempMax))),
    precipMm: round1(avg(bases.map(b => b.precipMm))),
    wetShare: bases.filter(b => b.precipMm >= 1).length / bases.length,
    years: usable.length,
    fujiMedian: median,
    fujiGoodShare: scores.length ? scores.filter(s => s >= 55).length / scores.length : null,
  };
}
