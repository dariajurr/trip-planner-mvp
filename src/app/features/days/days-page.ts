import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FlightBooking } from '../../core/models';
import { BookingService } from '../../core/services/booking.service';
import { ContentService } from '../../core/services/content.service';
import { Observer, WeatherService } from '../../core/services/weather.service';
import { TripStateStore } from '../../core/state/trip-state.store';
import { UserStateStore } from '../../core/state/user-state.store';
import { addDays, formatDay, formatShort, relativeDay, todayIso } from '../../core/utils/dates';
import { FUJI, FujiLabel, FUJI_HOURS, fujiLabel } from '../../core/utils/fuji';
import { haversineKm } from '../../core/utils/geo';
import { DayBookingLine, bookingsForDay, nightsWithoutHotel } from '../../core/utils/booking-utils';
import { formatMinutes, routeTotals, tripDates } from '../../core/utils/route-utils';
import { cityOnDay } from '../../core/utils/trip-utils';
import { DayEntry } from '../../core/utils/weather-aggregate';
import { weatherInfo } from '../../core/utils/weather-codes';
import { DayRoutePicker } from './day-route-picker';

/** Fuji is only worth showing for places within this distance. */
const FUJI_MAX_KM = 150;
const FUJI_NEAR_KM = 60;
const BUSY_MINUTES = 12 * 60;

export const FUJI_TEXT: Record<FujiLabel, string> = {
  excellent: 'Отлично видно',
  good: 'Скорее видно',
  possible: 'Возможно',
  unlikely: 'Вряд ли видно',
};

interface FujiVm {
  kind: 'forecast' | 'climate';
  score: number;
  level: FujiLabel;
  text: string;
  /** e.g. "7–10 ч" */
  best: string | null;
  detail: string;
  hours: { hour: number; score: number; level: FujiLabel }[];
}

interface WeatherVm {
  approx: boolean;
  icon: string;
  label: string;
  temp: string;
  precip: string;
  wind: string | null;
}

interface RouteVm {
  id: string;
  title: string;
  icon: string;
  duration: string | null;
  minutes: number;
  cities: string;
  stops: string[];
  weatherDependent: boolean;
  fuji: boolean;
}

interface Warning {
  text: string;
  /** Suggest moving a route to another day. */
  move?: { routeId: string; to: string; label: string };
}

interface DayVm {
  date: string;
  label: string;
  relative: string;
  tags: string[];
  isToday: boolean;
  isPast: boolean;
  cityName: string;
  weather: WeatherVm | null;
  fuji: FujiVm | null;
  routes: RouteVm[];
  bookings: DayBookingLine[];
  noHotel: boolean;
  warnings: Warning[];
  busy: string | null;
}

interface StripItem {
  date: string;
  label: string;
  relative: string;
  score: number;
  level: FujiLabel;
  text: string;
  climate: boolean;
}

@Component({
  selector: 'app-days-page',
  imports: [RouterLink, DayRoutePicker],
  templateUrl: './days-page.html',
  styleUrl: './days-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DaysPage {
  private readonly content = inject(ContentService);
  private readonly tripState = inject(TripStateStore);
  private readonly userState = inject(UserStateStore);
  private readonly bookingSvc = inject(BookingService);
  protected readonly weather = inject(WeatherService);

  protected readonly today = todayIso();
  protected readonly trip = this.tripState.trip;
  protected readonly expanded = signal<string | null>(null);
  protected readonly pickerDate = signal<string | null>(null);

  protected readonly dates = computed(() => {
    const t = this.trip();
    return t ? tripDates(t.startDate, t.endDate) : [];
  });

  private readonly observers = computed<Observer[]>(() =>
    this.tripState.cities().flatMap(city => {
      const c = this.content.getCityCoordinates(city.id);
      return c ? [{ cityId: city.id, lat: c.lat, lng: c.lng, distanceKm: haversineKm(c.lat, c.lng, FUJI.lat, FUJI.lng) }] : [];
    }),
  );

  /** The trip city closest to Fuji: the base for "when to go to Fuji". */
  protected readonly fujiBase = computed(() =>
    this.observers().filter(o => o.distanceKm <= FUJI_NEAR_KM).sort((a, b) => a.distanceKm - b.distanceKm)[0],
  );

  protected readonly fujiBaseName = computed(() => {
    const base = this.fujiBase();
    return base ? this.content.getCity(base.cityId)?.name ?? '' : '';
  });

  constructor() {
    effect(() => {
      const trip = this.trip();
      const observers = this.observers();
      const dates = this.dates();
      if (!trip || !observers.length) return;
      untracked(() => void this.weather.refresh({ tripId: trip.id, dates, observers }));
    });

    effect(() => {
      const dates = this.dates();
      if (untracked(this.expanded) === null && dates.includes(this.today)) {
        untracked(() => this.expanded.set(this.today));
      }
    });
  }

  // ---- derived -----------------------------------------------------------
  private fujiValue(entry: DayEntry | undefined): number | null {
    if (!entry) return null;
    if (entry.source === 'forecast') return entry.fuji?.score ?? null;
    // climate: the share of past years with a good view is more honest than a median score
    return entry.fujiGoodShare !== null ? Math.round(entry.fujiGoodShare * 100) : entry.fujiMedian;
  }

  protected readonly strip = computed<{ items: StripItem[]; best: StripItem | null } | null>(() => {
    const base = this.fujiBase();
    if (!base) return null;

    const all = this.dates()
      .filter(d => d >= this.today)
      .flatMap(date => {
        const entry = this.weather.entry(base.cityId, date);
        const score = this.fujiValue(entry);
        if (score === null || !entry) return [];
        const level = fujiLabel(score);
        const text =
          entry.source === 'climate' && entry.fujiGoodShare !== null
            ? `видно в ${Math.round(entry.fujiGoodShare * entry.years)} из ${entry.years} лет`
            : FUJI_TEXT[level];
        return [{ date, label: formatDay(date), relative: relativeDay(date, this.today), score, level, text, climate: entry.source === 'climate' }];
      });

    if (!all.length) return null;
    const items = [...all].sort((a, b) => b.score - a.score || a.date.localeCompare(b.date)).slice(0, 3);
    return { items, best: items[0] };
  });

  protected readonly days = computed<DayVm[]>(() => {
    const trip = this.trip();
    if (!trip) return [];
    const dates = this.dates();
    const base = this.fujiBase();
    const best = this.strip()?.best ?? null;
    const bookings = this.bookingSvc.bookings();
    const uncovered = new Set(nightsWithoutHotel(bookings, trip.startDate, trip.endDate));

    return dates.map((date, index) => {
      const cityId = this.dayCity(date);
      const observer = this.observers().find(o => o.cityId === cityId);
      const entry = cityId ? this.weather.entry(cityId, date) : undefined;

      const routes: RouteVm[] = this.userState.getAssignedRouteIds(trip.id, date).flatMap(id => {
        const route = this.content.getRoute(id);
        if (!route) return [];
        const totals = routeTotals(route, p => this.content.getPlace(p));
        const minutes = route.recommendedDurationMin ?? totals.onSiteMin + totals.travelMin;
        const cityIds = this.content.getRouteCityIds(route);
        return [{
          id: route.id,
          title: route.title,
          icon: route.icon ?? '🗺️',
          duration: minutes ? formatMinutes(minutes) : null,
          minutes,
          cities: cityIds.map(c => this.content.getCity(c)?.name ?? '').filter(Boolean).join(' → '),
          stops: route.stops.map(s => this.content.getPlace(s.placeId)?.name ?? 'Точка удалена'),
          weatherDependent: !!route.weatherDependent,
          fuji: !!base && cityIds.includes(base.cityId),
        }];
      });

      const totalMin = routes.reduce((sum, r) => sum + r.minutes, 0);

      const tags: string[] = [];
      if (index === 0) tags.push('Первый день');
      if (index === dates.length - 1 && dates.length > 1) tags.push('Последний день');

      return {
        date,
        label: formatDay(date),
        relative: relativeDay(date, this.today),
        tags,
        isToday: date === this.today,
        isPast: date < this.today,
        cityName: cityId ? this.content.getCity(cityId)?.name ?? '' : '',
        weather: this.weatherVm(entry),
        fuji: observer && observer.distanceKm <= FUJI_MAX_KM ? this.fujiVm(entry) : null,
        routes,
        bookings: bookingsForDay(bookings, date),
        noHotel: uncovered.has(date),
        warnings: this.warnings(date, routes, entry, best),
        busy: totalMin > BUSY_MINUTES ? formatMinutes(totalMin) : null,
      };
    });
  });

  protected readonly climateNotice = computed(() => {
    const horizon = this.weather.horizon();
    const first = this.dates().find(d => horizon && d > horizon && d >= this.today);
    return first ? `Прогноз на ${formatShort(first)} появится ${formatShort(addDays(first, -15))}. Пока показан климат этих дат за 5 прошлых лет.` : null;
  });

  protected readonly updated = computed(() => {
    const at = this.weather.updatedAt();
    return at ? new Date(at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  });

  // ---- actions -----------------------------------------------------------
  protected toggle(date: string): void {
    this.expanded.update(current => (current === date ? null : date));
  }

  protected assign(date: string, routeId: string): void {
    const trip = this.trip();
    if (trip) this.userState.assignRoute(trip.id, routeId, date);
  }

  protected unassign(date: string, routeId: string): void {
    const trip = this.trip();
    if (trip) this.userState.unassignRoute(trip.id, routeId, date);
  }

  protected move(routeId: string, from: string, to: string): void {
    const trip = this.trip();
    if (!trip) return;
    this.userState.unassignRoute(trip.id, routeId, from);
    this.userState.assignRoute(trip.id, routeId, to);
    this.expanded.set(to);
  }

  protected reload(): void {
    const trip = this.trip();
    if (trip) void this.weather.refresh({ tripId: trip.id, dates: this.dates(), observers: this.observers() }, true);
  }

  // ---- helpers -----------------------------------------------------------
  /** Where the user is that day: the first city of the first route, else the trip's main city. */
  private dayCity(date: string): string | undefined {
    const trip = this.trip();
    if (!trip) return undefined;
    const known = new Set(this.observers().map(o => o.cityId));

    for (const id of this.userState.getAssignedRouteIds(trip.id, date)) {
      const route = this.content.getRoute(id);
      const city = route ? this.content.getRouteCityIds(route)[0] : undefined;
      if (city && known.has(city)) return city;
    }
    const bookings = this.bookingSvc.bookings();
    const stay = bookings.find(b => b.kind === 'hotel' && b.cityId && b.checkIn.date <= date && date < b.checkOut.date);
    if (stay?.kind === 'hotel' && stay.cityId && known.has(stay.cityId)) return stay.cityId;

    // otherwise, by flights: the city where the traveller last landed (so Vietnam days show Vietnamese weather)
    const byName = new Map(this.tripState.cities().filter(c => known.has(c.id)).map(c => [c.name.toLowerCase(), c.id]));
    const flights = bookings.filter((b): b is FlightBooking => b.kind === 'flight');
    const flightCity = cityOnDay(flights, date, name => byName.has(name.toLowerCase()));
    if (flightCity) return byName.get(flightCity.toLowerCase());

    return trip.cityIds.find(c => known.has(c));
  }

  private weatherVm(entry: DayEntry | undefined): WeatherVm | null {
    if (!entry) return null;
    const temp = entry.tempMin === entry.tempMax ? `${entry.tempMax}°` : `${entry.tempMax}° / ${entry.tempMin}°`;

    if (entry.source === 'forecast') {
      const info = weatherInfo(entry.code);
      return {
        approx: false,
        icon: info.icon,
        label: info.label,
        temp,
        precip: entry.precipMm >= 0.5 ? `осадки ${entry.precipMm} мм` : 'без осадков',
        wind: `ветер до ${entry.windMax} км/ч`,
      };
    }
    const wet = Math.round(entry.wetShare * entry.years);
    return {
      approx: true,
      icon: '🌡️',
      label: 'Обычно в эти дни',
      temp: `≈ ${temp}`,
      precip: wet ? `осадки в ${wet} из ${entry.years} лет` : 'осадков обычно нет',
      wind: null,
    };
  }

  private fujiVm(entry: DayEntry | undefined): FujiVm | null {
    if (!entry) return null;

    if (entry.source === 'forecast') {
      const f = entry.fuji;
      if (!f) return null;
      return {
        kind: 'forecast',
        score: f.score,
        level: f.label,
        text: FUJI_TEXT[f.label],
        best: `${f.best.from}–${f.best.to} ч`,
        detail: `Облака: внизу ${f.factors.lowCloud}%, на высоте вершины ${f.factors.midCloud}% · влажность ${f.factors.humidity}%${f.factors.precipMm ? ` · осадки ${f.factors.precipMm} мм` : ''}`,
        hours: f.hours.map(h => ({ ...h, level: fujiLabel(h.score) })),
      };
    }
    const score = this.fujiValue(entry);
    if (score === null) return null;
    const level = fujiLabel(score);
    const good = entry.fujiGoodShare === null ? null : Math.round(entry.fujiGoodShare * entry.years);
    return {
      kind: 'climate',
      score,
      level,
      text: good === null ? FUJI_TEXT[level] : `Видно в ${good} из ${entry.years} лет`,
      best: null,
      detail: `Оценка по погоде этих дат за ${entry.years} ${entry.years === 1 ? 'год' : 'лет'}. Точный прогноз появится позже.`,
      hours: [],
    };
  }

  private warnings(date: string, routes: RouteVm[], entry: DayEntry | undefined, best: StripItem | null): Warning[] {
    const out: Warning[] = [];
    const base = this.fujiBase();

    const wet = entry && (entry.source === 'forecast' ? entry.precipMm >= 3 || entry.code >= 51 : entry.wetShare >= 0.5);
    for (const r of routes.filter(r => r.weatherDependent)) {
      if (wet) {
        out.push({ text: `☂️ «${r.title}» зависит от погоды, а ${entry!.source === 'forecast' ? 'ожидаются осадки' : 'в эти дни часто бывают осадки'}.` });
      }
    }

    if (base) {
      const baseEntry = this.weather.entry(base.cityId, date);
      const score = this.fujiValue(baseEntry);
      const bad = baseEntry && score !== null && (baseEntry.source === 'forecast' ? score < 35 : (baseEntry.fujiGoodShare ?? 1) < 0.3);
      for (const r of routes.filter(r => r.fuji)) {
        if (!bad || score === null) continue;
        const suggestion = best && best.date !== date && best.score >= score + 20 ? best : null;
        out.push({
          text: `🗻 «${r.title}»: Фудзи вряд ли будет видно в этот день.${suggestion ? ` Лучше ${suggestion.label} (${suggestion.score}/100).` : ''}`,
          ...(suggestion ? { move: { routeId: r.id, to: suggestion.date, label: `Перенести на ${suggestion.label}` } } : {}),
        });
      }
    }
    return out;
  }

  protected readonly hourRange = FUJI_HOURS;
}
