import { Injectable, inject, signal } from '@angular/core';

import { FUJI, HourSample } from '../utils/fuji';
import { addDays, shiftYears, todayIso } from '../utils/dates';
import { DayEntry, climateDay, forecastDay, groupByDate, parseHourly } from '../utils/weather-aggregate';
import { LocalStorageService } from './local-storage.service';

export interface Observer {
  cityId: string;
  lat: number;
  lng: number;
  /** Distance from the city to the summit of Mt. Fuji. */
  distanceKm: number;
}

export interface WeatherRequest {
  tripId: string;
  dates: string[];
  observers: Observer[];
  /** For tests: overrides the device date. */
  today?: string;
}

type Entries = Record<string, Record<string, DayEntry>>; // cityId -> date -> entry

interface Cache {
  key: string;
  horizon: string;
  forecastAt: number | null;
  climateAt: number | null;
  entries: Entries;
}

const CACHE_KEY = 'trip-app.weather.v2';
const MAX_CACHED_TRIPS = 6;
const FORECAST_TTL_MS = 3 * 3600_000;
const CLIMATE_TTL_MS = 30 * 24 * 3600_000;
const FORECAST_DAYS = 16;
const CLIMATE_YEARS = 5;
const TIMEOUT_MS = 12_000;
const CONCURRENCY = 5;

const HOURLY = 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,cloud_cover_low,cloud_cover_mid,cloud_cover_high';
const r3 = (n: number) => Math.round(n * 1000) / 1000;

async function pool<T>(tasks: (() => Promise<T>)[], size: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        results[i] = await tasks[i]();
      }
    }),
  );
  return results;
}

/**
 * Weather from Open-Meteo (free, no key): the forecast for the next 16 days, and for later dates
 * the climate of the same calendar days in the previous 5 years. Results are cached so the screen
 * keeps working without a connection during the trip.
 */
@Injectable({ providedIn: 'root' })
export class WeatherService {
  private readonly storage = inject(LocalStorageService);

  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  /** True when the network failed and older cached data is shown. */
  readonly stale = signal(false);
  readonly updatedAt = signal<number | null>(null);
  /** Last date that the forecast covers (today + 15). */
  readonly horizon = signal<string | null>(null);

  private readonly entries = signal<Entries>({});

  entry(cityId: string, date: string): DayEntry | undefined {
    return this.entries()[cityId]?.[date];
  }

  async refresh(req: WeatherRequest, force = false): Promise<void> {
    const today = req.today ?? todayIso();
    const horizon = addDays(today, FORECAST_DAYS - 1);
    const dates = req.dates.filter(d => d >= today);
    const forecastDates = dates.filter(d => d <= horizon);
    const climateDates = dates.filter(d => d > horizon);
    const key = [req.tripId, req.dates[0], req.dates[req.dates.length - 1], req.observers.map(o => o.cityId).join(',')].join('|');

    this.horizon.set(horizon);
    if (!dates.length || !req.observers.length) {
      this.entries.set({});
      this.status.set('ready');
      return;
    }

    const cached = this.load(key);
    if (cached) {
      this.entries.set(cached.entries);
      this.updatedAt.set(cached.forecastAt ?? cached.climateAt);
    }

    const now = Date.now();
    const missingClimate = climateDates.some(d => req.observers.some(o => !cached?.entries[o.cityId]?.[d]));
    const needForecast = forecastDates.length > 0 && (force || !cached || cached.horizon !== horizon || !cached.forecastAt || now - cached.forecastAt > FORECAST_TTL_MS);
    const needClimate = climateDates.length > 0 && (force || !cached || missingClimate || !cached.climateAt || now - cached.climateAt > CLIMATE_TTL_MS);

    if (!needForecast && !needClimate) {
      this.stale.set(false);
      this.status.set('ready');
      return;
    }

    this.status.set(cached ? 'ready' : 'loading');
    const entries: Entries = JSON.parse(JSON.stringify(cached?.entries ?? {}));
    let failed = false;
    let got = false;

    if (needForecast) {
      const result = await this.fetchForecast(req.observers, forecastDates);
      failed ||= result.failed;
      if (result.entries) {
        got = true;
        for (const [city, days] of Object.entries(result.entries)) entries[city] = { ...entries[city], ...days };
      }
    }
    if (needClimate) {
      const result = await this.fetchClimate(req.observers, climateDates);
      failed ||= result.failed;
      if (result.entries) {
        got = true;
        for (const [city, days] of Object.entries(result.entries)) entries[city] = { ...entries[city], ...days };
      }
    }

    if (!got) {
      // nothing new: keep whatever is cached
      this.stale.set(!!cached);
      this.status.set(cached ? 'ready' : 'error');
      return;
    }

    const next: Cache = {
      key,
      horizon,
      forecastAt: needForecast && got ? now : cached?.forecastAt ?? null,
      climateAt: needClimate && got ? now : cached?.climateAt ?? null,
      entries,
    };
    this.save(key, next);
    this.entries.set(entries);
    this.updatedAt.set(next.forecastAt ?? next.climateAt);
    this.stale.set(failed && !!cached);
    this.status.set('ready');
  }

  // ---- fetching ----------------------------------------------------------
  private async fetchForecast(observers: Observer[], dates: string[]): Promise<{ entries?: Entries; failed: boolean }> {
    const points = [...observers.map(o => ({ lat: o.lat, lng: o.lng })), FUJI];
    const url = (p: { lat: number; lng: number }) =>
      `https://api.open-meteo.com/v1/forecast?latitude=${r3(p.lat)}&longitude=${r3(p.lng)}&hourly=${HOURLY},visibility&timezone=auto&forecast_days=${FORECAST_DAYS}`;

    const results = await pool(points.map(p => () => this.getJson(url(p)).then(parseHourly).catch(() => null)), CONCURRENCY);
    const summit = results[results.length - 1];
    const summitByDate = summit ? groupByDate(summit) : {};
    const entries: Entries = {};
    let failed = results.some(r => r === null);

    observers.forEach((o, i) => {
      const hours = results[i];
      if (!hours) return;
      const byDate = groupByDate(hours);
      for (const d of dates) {
        const e = forecastDay(byDate[d] ?? [], summitByDate[d] ?? [], o.distanceKm);
        if (e) (entries[o.cityId] ??= {})[d] = e;
        else failed = true;
      }
    });
    return { entries: Object.keys(entries).length ? entries : undefined, failed };
  }

  private async fetchClimate(observers: Observer[], dates: string[]): Promise<{ entries?: Entries; failed: boolean }> {
    const points = [...observers.map(o => ({ lat: o.lat, lng: o.lng })), FUJI];
    const first = dates[0];
    const last = dates[dates.length - 1];

    const jobs: { k: number; pi: number }[] = [];
    for (let k = 1; k <= CLIMATE_YEARS; k++) for (let pi = 0; pi < points.length; pi++) jobs.push({ k, pi });

    const results = await pool(
      jobs.map(({ k, pi }) => () => {
        const p = points[pi];
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${r3(p.lat)}&longitude=${r3(p.lng)}&start_date=${shiftYears(first, -k)}&end_date=${shiftYears(last, -k)}&hourly=${HOURLY}&timezone=auto`;
        return this.getJson(url).then(j => groupByDate(parseHourly(j))).catch(() => null);
      }),
      CONCURRENCY,
    );

    const byJob = new Map(jobs.map((j, i) => [`${j.k}:${j.pi}`, results[i]]));
    const entries: Entries = {};
    const failed = results.some(r => r === null);

    observers.forEach((o, oi) => {
      for (const d of dates) {
        const years: { obs: HourSample[]; summit: HourSample[] }[] = [];
        for (let k = 1; k <= CLIMATE_YEARS; k++) {
          const day = shiftYears(d, -k);
          const obs = byJob.get(`${k}:${oi}`)?.[day];
          const summit = byJob.get(`${k}:${points.length - 1}`)?.[day] ?? [];
          if (obs?.length) years.push({ obs, summit });
        }
        const e = climateDay(years, o.distanceKm);
        if (e) (entries[o.cityId] ??= {})[d] = e;
      }
    });
    return { entries: Object.keys(entries).length ? entries : undefined, failed };
  }

  private async getJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  private load(key: string): Cache | null {
    const cache = this.storage.get<Record<string, Cache>>(CACHE_KEY)?.[key];
    return cache && cache.entries ? cache : null;
  }

  /** Every trip keeps its own cache entry; the oldest ones are dropped. */
  private save(key: string, cache: Cache): void {
    const all = { ...(this.storage.get<Record<string, Cache>>(CACHE_KEY) ?? {}), [key]: cache };
    const newest = Object.entries(all)
      .sort(([, a], [, b]) => (b.forecastAt ?? b.climateAt ?? 0) - (a.forecastAt ?? a.climateAt ?? 0))
      .slice(0, MAX_CACHED_TRIPS);
    this.storage.set(CACHE_KEY, Object.fromEntries(newest));
  }
}
