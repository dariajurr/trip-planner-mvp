/** One hour of weather at one point (local time). */
export interface HourSample {
  date: string; // YYYY-MM-DD
  hour: number; // 0-23
  temp: number; // °C
  rh: number; // relative humidity, %
  precip: number; // mm
  code: number; // WMO weather code
  wind: number; // km/h
  low: number; // low clouds + fog up to ~3 km, %
  mid: number; // mid clouds ~3-8 km (the summit is at 3.8 km), %
  high: number; // high clouds, %
  /** Visibility in km. Only the forecast API has it, the archive does not. */
  visKm?: number;
}

export type FujiLabel = 'excellent' | 'good' | 'possible' | 'unlikely';

export interface FujiDayScore {
  score: number; // 0-100
  label: FujiLabel;
  /** The best 3 hour window: from (inclusive) to (exclusive). */
  best: { from: number; to: number };
  hours: { hour: number; score: number }[];
  /** Averages over the best window, for explanation. */
  factors: { lowCloud: number; midCloud: number; humidity: number; precipMm: number };
}

export const FUJI = { lat: 35.3606, lng: 138.7274 };

/** Hours that are considered for the day score and shown in the hourly bars. */
export const FUJI_HOURS = { from: 6, to: 17 };
const WINDOW = 3;

const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

export function fujiLabel(score: number): FujiLabel {
  if (score >= 75) return 'excellent';
  if (score >= 55) return 'good';
  if (score >= 35) return 'possible';
  return 'unlikely';
}

/** Low clouds / fog at the observer hide the view; low clouds only around the base of the mountain hide less. */
const lowBlock = (obs: HourSample, summit: HourSample) => Math.max(obs.low, summit.low * 0.6) / 100;
/** Clouds at the summit's height (3.8 km) hide the peak; mid clouds overhead of the observer matter less. */
const midBlock = (obs: HourSample, summit: HourSample) => Math.max(summit.mid, obs.mid * 0.6) / 100;

/**
 * Rough chance (0-100) that Mt. Fuji can be seen, for one hour.
 *
 * The line of sight is blocked mainly by low clouds at the observer and by mid-level clouds
 * around the summit (3.8 km). Humidity and precipitation add haze, and the farther the observer,
 * the more haze matters. It is a heuristic built from forecast data, not a guarantee.
 */
export function fujiHourScore(obs: HourSample, summit: HourSample, distanceKm: number): number {
  const low = lowBlock(obs, summit);
  const mid = midBlock(obs, summit);
  const high = Math.max(obs.high, summit.high) / 100;

  const blocked = 1 - (1 - low) * (1 - mid);
  const cloud = 0.85 * blocked + 0.05 * high;

  const far = clamp(distanceKm, 0, 100) / 100;
  const haze = 0.15 * clamp((obs.rh - 55) / 35, 0, 1) * (0.5 + 0.5 * far);

  const code = Math.max(obs.code, summit.code);
  const precip = Math.max(obs.precip, summit.precip);
  let wet = 0;
  if (precip >= 0.1) wet = 0.3;
  if (code >= 51 || obs.code === 45 || obs.code === 48) wet = 0.5;

  let vis = 0;
  if (obs.visKm !== undefined) {
    const need = clamp(distanceKm * 0.3, 8, 30);
    vis = 0.2 * clamp((need - obs.visKm) / need, 0, 1);
  }

  return Math.round(100 * (1 - clamp(cloud + haze + wet + vis, 0, 1)));
}

/** Day score = the best 3 hour window during the day (a clear morning is enough). */
export function fujiDayScore(obs: HourSample[], summit: HourSample[], distanceKm: number): FujiDayScore | null {
  const summitByHour = new Map(summit.map(h => [h.hour, h]));
  const pairs = obs
    .filter(h => h.hour >= FUJI_HOURS.from && h.hour <= FUJI_HOURS.to && summitByHour.has(h.hour))
    .map(h => ({ hour: h.hour, o: h, s: summitByHour.get(h.hour)!, score: fujiHourScore(h, summitByHour.get(h.hour)!, distanceKm) }))
    .sort((a, b) => a.hour - b.hour);

  if (pairs.length < WINDOW) return null;

  let best = { start: 0, avg: -1 };
  for (let i = 0; i + WINDOW <= pairs.length; i++) {
    const avg = pairs.slice(i, i + WINDOW).reduce((sum, p) => sum + p.score, 0) / WINDOW;
    if (avg > best.avg) best = { start: i, avg };
  }

  const win = pairs.slice(best.start, best.start + WINDOW);
  const mean = (f: (p: (typeof win)[number]) => number) => Math.round(win.reduce((sum, p) => sum + f(p), 0) / win.length);
  const score = Math.round(best.avg);

  return {
    score,
    label: fujiLabel(score),
    best: { from: win[0].hour, to: win[win.length - 1].hour + 1 },
    hours: pairs.map(p => ({ hour: p.hour, score: p.score })),
    factors: {
      lowCloud: mean(p => lowBlock(p.o, p.s) * 100),
      midCloud: mean(p => midBlock(p.o, p.s) * 100),
      humidity: mean(p => p.o.rh),
      precipMm: Math.round(win.reduce((sum, p) => sum + Math.max(p.o.precip, p.s.precip), 0) * 10) / 10,
    },
  };
}
