/** WMO weather interpretation codes used by Open-Meteo. */
export function weatherInfo(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: '☀️', label: 'Ясно' };
  if (code === 1) return { icon: '🌤️', label: 'Преимущественно ясно' };
  if (code === 2) return { icon: '⛅', label: 'Переменная облачность' };
  if (code === 3) return { icon: '☁️', label: 'Пасмурно' };
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Туман' };
  if (code >= 51 && code <= 57) return { icon: '🌦️', label: 'Морось' };
  if (code >= 61 && code <= 67) return { icon: '🌧️', label: 'Дождь' };
  if (code >= 71 && code <= 77) return { icon: '🌨️', label: 'Снег' };
  if (code >= 80 && code <= 82) return { icon: '🌧️', label: 'Ливни' };
  if (code === 85 || code === 86) return { icon: '🌨️', label: 'Снегопад' };
  if (code >= 95) return { icon: '⛈️', label: 'Гроза' };
  return { icon: '☁️', label: 'Облачно' };
}

/** The code that best describes a day: significant weather wins over cloud cover. */
export function dominantCode(codes: number[]): number {
  if (!codes.length) return 0;
  const significant = codes.filter(c => c >= 45);
  const pool = significant.length >= 2 || significant.some(c => c >= 95) ? significant : codes.filter(c => c <= 3);
  const source = pool.length ? pool : codes;
  const counts = new Map<number, number>();
  for (const c of source) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}
