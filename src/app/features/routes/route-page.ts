import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { PhotoSpot, PlacePhoto, Route, RouteStop, TransportOption, TransportType } from '../../core/models';
import { ContentService } from '../../core/services/content.service';
import { RouteEditService, RouteMeta } from '../../core/services/route-edit.service';
import { TripStateStore } from '../../core/state/trip-state.store';
import { UserStateStore } from '../../core/state/user-state.store';
import { directionsUrl, distanceKm, formatKm, formatMinutes, routeTotals, tripDates } from '../../core/utils/route-utils';
import { PhotoImg } from '../../shared/photo-img';
import { CATEGORY_LABELS, PHOTO_TIME_LABELS } from '../places/place-labels';
import { RouteEditor } from './route-editor';
import { StopPicker } from './stop-picker';
import { TAG_LABELS, TRANSPORT, TRANSPORT_TYPES } from './route-labels';

interface StopVm {
  index: number;
  stop: RouteStop;
  missing: boolean;
  name: string;
  nameLocal: string | null;
  icon: string;
  areaName: string;
  visited: boolean;
  photo: PlacePhoto | null;
  mapsUrl: string | null;
  duration: number | null;
  isLast: boolean;
  leg: { icon: string; text: string } | null;
}

interface SpotVm {
  spot: PhotoSpot;
  areaName: string;
  time: string | null;
  done: boolean;
  onRoute: boolean;
}

const dateLabel = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDate = (iso: string) => dateLabel.format(new Date(`${iso}T12:00:00`));

@Component({
  selector: 'app-route-page',
  imports: [RouterLink, PhotoImg, RouteEditor, StopPicker],
  templateUrl: './route-page.html',
  styleUrl: './route-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoutePage {
  readonly id = input.required<string>();

  private readonly content = inject(ContentService);
  private readonly tripState = inject(TripStateStore);
  private readonly userState = inject(UserStateStore);
  private readonly edits = inject(RouteEditService);
  private readonly router = inject(Router);

  protected readonly transportTypes = TRANSPORT_TYPES.map(type => ({ type, ...TRANSPORT[type] }));

  protected readonly editMode = signal(false);
  protected readonly metaOpen = signal(false);
  protected readonly pickerOpen = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly assignDate = signal('');
  protected readonly message = signal<string | null>(null);

  protected readonly route = computed<Route | undefined>(() => this.content.getRoute(this.id()));

  protected readonly overridden = computed(() => this.edits.isOverridden(this.id()));

  protected readonly tags = computed(() => (this.route()?.tags ?? []).map(t => TAG_LABELS[t] ?? t));

  protected readonly cities = computed(() => {
    const r = this.route();
    return r ? this.content.getRouteCityIds(r).map(id => this.content.getCity(id)?.name ?? '').filter(Boolean).join(' → ') : '';
  });

  protected readonly stops = computed<StopVm[]>(() => {
    const route = this.route();
    if (!route) return [];

    return route.stops.map((stop, index) => {
      const place = this.content.getPlace(stop.placeId);
      const next = route.stops[index + 1];
      const nextPlace = next ? this.content.getPlace(next.placeId) : undefined;
      const km = place && nextPlace ? distanceKm(place.coordinates, nextPlace.coordinates) : null;

      return {
        index,
        stop,
        missing: !place,
        name: place?.name ?? 'Точка удалена',
        nameLocal: place?.nameLocal ?? null,
        icon: place ? CATEGORY_LABELS[place.category].icon : '❔',
        areaName: place ? this.content.getArea(place.areaId)?.name ?? '' : '',
        visited: this.userState.isVisited(stop.placeId),
        photo: place?.photos?.[0] ?? null,
        mapsUrl: place
          ? place.googleMapsUrl ?? `https://www.google.com/maps/search/?api=1&query=${place.coordinates.lat},${place.coordinates.lng}`
          : null,
        duration: stop.recommendedDurationMin ?? place?.recommendedDurationMin ?? null,
        isLast: index === route.stops.length - 1,
        leg: next ? this.legText(stop.transportToNext, km) : null,
      };
    });
  });

  protected readonly totals = computed(() => {
    const route = this.route();
    if (!route) return null;
    const t = routeTotals(route, id => this.content.getPlace(id));
    return {
      stops: t.stops,
      onSite: t.onSiteMin ? formatMinutes(t.onSiteMin) : null,
      travel: t.travelMin ? formatMinutes(t.travelMin) : null,
      km: t.km > 0 ? formatKm(t.km) : null,
      all: t.onSiteMin + t.travelMin ? formatMinutes(t.onSiteMin + t.travelMin) : null,
    };
  });

  protected readonly directions = computed(() => {
    const route = this.route();
    if (!route) return null;
    const points = route.stops.flatMap(s => {
      const p = this.content.getPlace(s.placeId);
      return p ? [p.coordinates] : [];
    });
    return directionsUrl(points);
  });

  protected readonly visitedCount = computed(() => this.stops().filter(s => s.visited).length);

  protected readonly spots = computed<SpotVm[]>(() => {
    const route = this.route();
    if (!route) return [];
    const placeIds = new Set(route.stops.map(s => s.placeId));
    const areaIds = new Set(route.stops.flatMap(s => {
      const p = this.content.getPlace(s.placeId);
      return p ? [p.areaId] : [];
    }));

    return this.content
      .getPhotoSpots()
      .filter(sp => sp.placeIds.some(id => placeIds.has(id)) || areaIds.has(sp.areaId))
      .map(spot => ({
        spot,
        areaName: this.content.getArea(spot.areaId)?.name ?? '',
        time: spot.bestTime ? PHOTO_TIME_LABELS[spot.bestTime] : null,
        done: this.userState.getPhotoSpotState(spot.id)?.status === 'done',
        onRoute: spot.placeIds.some(id => placeIds.has(id)),
      }))
      .sort((a, b) => Number(b.onRoute) - Number(a.onRoute));
  });

  protected readonly dates = computed(() => {
    const trip = this.tripState.trip();
    return trip ? tripDates(trip.startDate, trip.endDate).map(iso => ({ iso, label: fmtDate(iso) })) : [];
  });

  protected readonly assigned = computed(() => {
    const trip = this.tripState.trip();
    if (!trip) return [];
    return this.userState
      .assignedRoutes()
      .filter(a => a.tripId === trip.id && a.routeId === this.id() && !a.deleted)
      .map(a => ({ iso: a.date, label: fmtDate(a.date) }))
      .sort((a, b) => a.iso.localeCompare(b.iso));
  });

  constructor() {
    // an empty (new) route opens straight in edit mode
    effect(() => {
      const route = this.route();
      if (route && route.stops.length === 0) {
        untracked(() => this.editMode.set(true));
      }
    });
    effect(() => {
      const first = this.dates()[0]?.iso;
      if (first && !untracked(this.assignDate)) {
        untracked(() => this.assignDate.set(this.tripState.selectedDate() ?? first));
      }
    });
  }

  // ---- stop editing ------------------------------------------------------
  protected move(index: number, delta: -1 | 1): void {
    this.edits.moveStop(this.id(), index, delta);
  }

  protected removeStop(index: number): void {
    this.edits.removeStop(this.id(), index);
  }

  protected togglePriority(vm: StopVm): void {
    this.edits.updateStop(this.id(), vm.index, { priority: vm.stop.priority === 'must' ? 'optional' : 'must' });
  }

  protected onDuration(vm: StopVm, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.edits.updateStop(this.id(), vm.index, { recommendedDurationMin: Number.isFinite(value) ? value : null });
  }

  protected onTransportType(vm: StopVm, event: Event): void {
    const type = (event.target as HTMLSelectElement).value as TransportType | '';
    const current = vm.stop.transportToNext;
    this.edits.updateStop(this.id(), vm.index, {
      transportToNext: type ? { ...current, type } : null,
    });
  }

  protected onTransportMin(vm: StopVm, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const current = vm.stop.transportToNext;
    if (!current) return;
    const next: TransportOption = { ...current };
    if (value > 0) next.durationMin = Math.round(value);
    else delete next.durationMin;
    this.edits.updateStop(this.id(), vm.index, { transportToNext: next });
  }

  protected addPicked(placeIds: string[]): void {
    this.edits.addPlaces(this.id(), placeIds);
  }

  protected tidy(): void {
    this.edits.reorderNearest(this.id());
    this.message.set('Остановки упорядочены по ближайшему соседу. Время в пути между ними сброшено там, где соседи изменились.');
  }

  protected setVisited(vm: StopVm): void {
    if (vm.visited) this.userState.clearPlaceStatus(vm.stop.placeId);
    else this.userState.markPlaceVisited(vm.stop.placeId);
  }

  protected togglePhotoDone(vm: SpotVm): void {
    this.userState.setPhotoStatus(vm.spot.id, vm.done ? 'want' : 'done');
  }

  // ---- route level -------------------------------------------------------
  protected saveMeta(meta: RouteMeta): void {
    this.edits.updateMeta(this.id(), meta);
  }

  protected duplicate(): void {
    const id = this.edits.duplicate(this.id());
    if (id) {
      this.editMode.set(false);
      void this.router.navigate(['/routes', id]);
    }
  }

  protected reset(): void {
    this.edits.resetToCatalog(this.id());
    this.message.set('Возвращён исходный маршрут.');
  }

  protected remove(): void {
    if (!this.confirmDelete()) {
      this.confirmDelete.set(true);
      return;
    }
    const trip = this.tripState.trip();
    if (trip) {
      for (const a of this.assigned()) {
        this.userState.unassignRoute(trip.id, this.id(), a.iso);
      }
    }
    this.edits.remove(this.id());
    void this.router.navigate(['/routes']);
  }

  protected assign(): void {
    const trip = this.tripState.trip();
    const date = this.assignDate();
    if (!trip || !date) return;
    this.userState.assignRoute(trip.id, this.id(), date);
    this.message.set(`Маршрут назначен на ${fmtDate(date)}.`);
  }

  protected unassign(iso: string): void {
    const trip = this.tripState.trip();
    if (trip) this.userState.unassignRoute(trip.id, this.id(), iso);
  }

  protected onAssignDate(event: Event): void {
    this.assignDate.set((event.target as HTMLSelectElement).value);
  }

  protected closeAll(): void {
    this.metaOpen.set(false);
    this.pickerOpen.set(false);
  }

  private legText(transport: TransportOption | undefined, km: number | null): { icon: string; text: string } | null {
    const dist = km !== null ? formatKm(km) : null;
    if (transport) {
      const t = TRANSPORT[transport.type];
      const parts = [
        transport.durationMin ? formatMinutes(transport.durationMin) : t.label,
        transport.line,
        dist ? `≈ ${dist} по прямой` : null,
      ].filter(Boolean);
      return { icon: t.icon, text: parts.join(' · ') };
    }
    return dist ? { icon: '↓', text: `≈ ${dist} по прямой` } : null;
  }
}
