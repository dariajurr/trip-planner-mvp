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
import { directionsUrl, distanceKm, formatMinutes, routeTotals, tripDates } from '../../core/utils/route-utils';
import { cityOnDay } from '../../core/utils/trip-utils';
import { DayEntry } from '../../core/utils/weather-aggregate';
import { weatherInfo } from '../../core/utils/weather-codes';
import { Coordinates, PlacePhoto } from '../../core/models';
import { PlaceVm, PlaceViewService } from '../../core/services/place-view.service';
import { PhotoImg } from '../../shared/photo-img';
import { PlaceCard } from '../../shared/place/place-card';
import { PhotoViewer } from '../../shared/place/photo-viewer';
import { PlaceSheet } from '../places/place-sheet';
import { PART_LABEL, PartOfDay, estimateTravelMin, formatClock, layoutDay, parseClock, partOfDay, segmentDays } from '../../core/utils/day-timeline';
import { sunTimes } from '../../core/utils/sun-times';
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

interface StopVm {
  vm: PlaceVm;
  /** Planned start, e.g. "09:30". */
  time: string;
  /** The previous stop, as the start of the route to this place. */
  from: Coordinates | null;
  /** "утро", "день" or "вечер": shown only where the part of the day changes. */
  partLabel: string | null;
  routeTitle: string | null;
}

interface SegmentVm {
  key: string;
  name: string;
  range: string;
  from: string;
  to: string;
}

interface DayVm {
  date: string;
  number: number;
  open: boolean;
  photo: PlacePhoto | null;
  sun: string | null;
  notes: string;
  mapUrl: string | null;
  stops: StopVm[];
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
  imports: [RouterLink, DayRoutePicker, PlaceCard, PlaceSheet, PhotoViewer, PhotoImg],
  templateUrl: './days-page.html',
  styleUrl: './days-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DaysPage {
  private readonly content = inject(ContentService);
  private readonly tripState = inject(TripStateStore);
  private readonly userState = inject(UserStateStore);
  private readonly bookingSvc = inject(BookingService);
  private readonly placeView = inject(PlaceViewService);
  protected readonly weather = inject(WeatherService);

  protected readonly today = todayIso();
  protected readonly trip = this.tripState.trip;
  protected readonly openDates = signal<Set<string>>(new Set());
  protected readonly segmentKey = signal<string | null>(null);
  protected readonly sheet = signal<{ id: string; from: Coordinates | null } | null>(null);
  protected readonly viewer = signal<{ vm: PlaceVm; index: number } | null>(null);
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
      // the day that matters is open at the start: today during the trip, otherwise the first day
      if (dates.length && untracked(this.openDates).size === 0) {
        untracked(() => this.openDates.set(new Set([dates.includes(this.today) ? this.today : dates[0]])));
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

      const city = cityId ? this.content.getCity(cityId) : undefined;
      const coords = cityId ? this.content.getCityCoordinates(cityId) : undefined;
      const sun = coords ? sunTimes(date, coords.lat, coords.lng, city?.timezone ?? 'UTC') : null;
      const stops = this.timeline(trip.id, date);
      const NOTE: Record<string, string> = { 'flight-arr': 'прилёт', 'flight-dep': 'вылет', 'hotel-in': 'заселение', 'hotel-out': 'выезд' };
      const lines = bookingsForDay(bookings, date);

      return {
        date,
        number: index + 1,
        open: this.openDates().has(date),
        photo: city?.photo ?? null,
        sun: sun ? `${sun.sunrise}–${sun.sunset}` : null,
        notes: [...new Set(lines.map(l => NOTE[l.kind]).filter(Boolean))].join(', '),
        mapUrl: this.mapUrl(stops),
        stops,
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

  /** Days grouped by city: shown as tabs when the trip goes through more than one place. */
  protected readonly segments = computed<SegmentVm[]>(() =>
    segmentDays(this.dates().map(date => ({ date, cityId: this.dayCity(date) }))).map(seg => ({
      key: `${seg.cityId}|${seg.from}`,
      name: this.content.getCity(seg.cityId)?.name ?? '',
      range: seg.from === seg.to ? formatShort(seg.from) : `${formatShort(seg.from)} – ${formatShort(seg.to)}`,
      from: seg.from,
      to: seg.to,
    })),
  );

  protected readonly shownDays = computed(() => {
    const seg = this.segments().find(x => x.key === this.segmentKey());
    return seg ? this.days().filter(d => d.date >= seg.from && d.date <= seg.to) : this.days();
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
    this.openDates.update(set => {
      const next = new Set(set);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  protected openSheet(stop: StopVm): void {
    this.sheet.set({ id: stop.vm.place.id, from: stop.from });
  }

  protected openPhoto(vm: PlaceVm, index: number): void {
    this.viewer.set({ vm, index });
  }

  protected toggleFavorite(placeId: string): void {
    this.userState.toggleFavorite(placeId);
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
    this.openDates.update(set => new Set(set).add(to));
  }

  protected reload(): void {
    const trip = this.trip();
    if (trip) void this.weather.refresh({ tripId: trip.id, dates: this.dates(), observers: this.observers() }, true);
  }

  // ---- helpers -----------------------------------------------------------
  /**
   * The stops of the day's routes, one after another with a time for each: the route's start (or 09:00),
   * the time at each place, and the way between them (as given in the route, or estimated from the distance).
   */
  private timeline(tripId: string, date: string): StopVm[] {
    const out: StopVm[] = [];
    let cursor: number | null = null;
    let previousPart: PartOfDay | null = null;
    let last: Coordinates | null = null;
    const routes = this.userState.getAssignedRouteIds(tripId, date).flatMap(id => {
      const r = this.content.getRoute(id);
      return r ? [r] : [];
    });

    for (const route of routes) {
      const stops = route.stops.flatMap(stop => {
        const place = this.content.getPlace(stop.placeId);
        return place ? [{ stop, place }] : [];
      });
      if (!stops.length) continue;

      const startAt = Math.max(cursor === null ? 0 : cursor + 30, parseClock(route.recommendedStartTime, 9 * 60));
      const slots = layoutDay(
        stops.map((x, i) => {
          const next = stops[i + 1]?.place;
          return {
            durationMin: x.stop.recommendedDurationMin ?? x.place.recommendedDurationMin ?? 60,
            travelToNextMin: x.stop.transportToNext?.durationMin ?? (next ? estimateTravelMin(distanceKm(x.place.coordinates, next.coordinates)) : 0),
          };
        }),
        startAt,
      );

      stops.forEach((x, i) => {
        const part = partOfDay(slots[i].start);
        out.push({
          vm: this.placeView.vm(x.place),
          time: formatClock(slots[i].start),
          from: i === 0 ? last : stops[i - 1].place.coordinates,
          partLabel: part !== previousPart ? PART_LABEL[part] : null,
          routeTitle: i === 0 ? route.title : null,
        });
        previousPart = part;
      });
      last = stops[stops.length - 1].place.coordinates;
      cursor = slots[slots.length - 1].end;
    }
    return out;
  }

  /** The day's places on one map: a route through them, or just the place when there is one. */
  private mapUrl(stops: StopVm[]): string | null {
    const points = stops.map(x => x.vm.place.coordinates);
    if (points.length === 1) return stops[0].vm.mapsUrl;
    return directionsUrl(points, 'walking')?.url ?? null;
  }

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
