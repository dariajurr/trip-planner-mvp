const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const norm = (x: number, m: number) => ((x % m) + m) % m;

/**
 * Sunrise and sunset in minutes after midnight UTC (NOAA solar position formulas, accurate to about a
 * minute). `null` during polar day or night. Pure calculation: it needs no network and works for any date.
 */
export function sunMinutesUtc(date: string, lat: number, lng: number): { rise: number; set: number } | null {
  const [y, m, d] = date.split('-').map(Number);
  const jd = Date.UTC(y, m - 1, d, 12) / 86_400_000 + 2440587.5; // Julian day at noon UTC
  const t = (jd - 2451545) / 36525;

  const l0 = norm(280.46646 + t * (36000.76983 + 0.0003032 * t), 360);
  const mean = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const center = Math.sin(rad(mean)) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(rad(2 * mean)) * (0.019993 - 0.000101 * t) + Math.sin(rad(3 * mean)) * 0.000289;
  const trueLong = l0 + center;
  const omega = 125.04 - 1934.136 * t;
  const apparent = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const obliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(obliq)) * Math.sin(rad(apparent))));
  const y2 = Math.tan(rad(obliq / 2)) ** 2;
  const eqTime = 4 * deg(y2 * Math.sin(2 * rad(l0)) - 2 * e * Math.sin(rad(mean)) + 4 * e * y2 * Math.sin(rad(mean)) * Math.cos(2 * rad(l0)) - 0.5 * y2 * y2 * Math.sin(4 * rad(l0)) - 1.25 * e * e * Math.sin(2 * rad(mean)));

  // the sun's centre 0.833 degrees below the horizon: refraction and the solar disc
  const cosH = Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(rad(decl))) - Math.tan(rad(lat)) * Math.tan(rad(decl));
  if (cosH < -1 || cosH > 1) return null;
  const h = deg(Math.acos(cosH));
  const noon = 720 - 4 * lng - eqTime; // minutes after midnight UTC
  return { rise: noon - 4 * h, set: noon + 4 * h };
}

/** UTC offset of a time zone on a given day, in minutes (handles daylight saving time). */
export function zoneOffsetMinutes(date: string, timeZone: string): number | null {
  try {
    const at = new Date(`${date}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(at);
    const v = (type: string) => Number(parts.find(p => p.type === type)?.value);
    const local = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'));
    return Math.round((local - at.getTime()) / 60_000);
  } catch {
    return null;
  }
}

const clock = (min: number) => {
  const total = Math.round(norm(min, 1440));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** "6:33" and "16:28" in the local time of the place, or null when the sun does not rise or set. */
export function sunTimes(date: string, lat: number, lng: number, timeZone: string): { sunrise: string; sunset: string } | null {
  const sun = sunMinutesUtc(date, lat, lng);
  if (!sun) return null;
  // without a usable time zone, the solar time of the longitude is the best guess
  const offset = zoneOffsetMinutes(date, timeZone) ?? Math.round((lng / 15) * 60);
  return { sunrise: clock(sun.rise + offset), sunset: clock(sun.set + offset) };
}
