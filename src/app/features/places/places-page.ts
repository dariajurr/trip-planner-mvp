import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { Area, PhotoSpot, Place, PlacePhoto, PlaceUserStatus } from '../../core/models';
import { ContentService } from '../../core/services/content.service';
import { TripStateStore } from '../../core/state/trip-state.store';
import { UserStateStore } from '../../core/state/user-state.store';
import { PhotoImg } from '../../shared/photo-img';
import { PlaceEditor } from './place-editor';
import {
  CATEGORY_LABELS,
  PHOTO_DIFFICULTY_LABELS,
  PHOTO_TIME_LABELS,
  formatDuration,
} from './place-labels';

type StatusFilter = 'all' | 'favorite' | 'todo' | 'visited';

interface PlaceVm {
  place: Place;
  icon: string;
  categoryLabel: string;
  areaName: string;
  cityName: string;
  duration: string | null;
  hours: string | null;
  mapsUrl: string;
  photos: PlacePhoto[];
  address: string | null;
  website: string | null;
  sources: string | null;
  custom: boolean;
  status: PlaceUserStatus | null;
  favorite: boolean;
}

interface PhotoSpotVm {
  spot: PhotoSpot;
  time: string | null;
  difficulty: string | null;
  detour: string | null;
  done: boolean;
}

const STATUS_ACTIONS: { value: PlaceUserStatus; label: string }[] = [
  { value: 'want', label: 'Хочу' },
  { value: 'visited', label: 'Был' },
  { value: 'not-wanted', label: 'Не хочу' },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'favorite', label: '♥ Избранное' },
  { value: 'todo', label: 'Осталось' },
  { value: 'visited', label: 'Были' },
];

@Component({
  selector: 'app-places-page',
  imports: [PhotoImg, PlaceEditor],
  templateUrl: './places-page.html',
  styleUrl: './places-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlacesPage {
  private readonly content = inject(ContentService);
  private readonly tripState = inject(TripStateStore);
  private readonly userState = inject(UserStateStore);
  private readonly document = inject(DOCUMENT);

  protected readonly statusActions = STATUS_ACTIONS;
  protected readonly statusFilters = STATUS_FILTERS;

  protected readonly cities = this.tripState.cities;

  protected readonly cityId = signal<string | null>(null);
  protected readonly areaId = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly statusFilter = signal<StatusFilter>('all');

  /** null = closed; place null = creating a new one. */
  protected readonly editor = signal<{ place: Place | null } | null>(null);
  protected readonly editorDefaults = computed(() => ({ cityId: this.cityId(), areaId: this.areaId() }));

  /** Areas of the selected city, or of all trip cities. */
  private readonly areas = computed<Area[]>(() => {
    const cityId = this.cityId();
    const cities = cityId ? this.cities().filter(c => c.id === cityId) : this.cities();
    return cities.flatMap(city => this.content.getAreasByCity(city.id));
  });

  protected readonly areaChips = computed(() =>
    this.areas().map(area => ({
      area,
      count: this.content.getPlacesByArea(area.id).length,
    })),
  );

  protected readonly selectedArea = computed(() => {
    const id = this.areaId();
    return id ? this.content.getArea(id) : undefined;
  });

  private readonly basePlaces = computed<Place[]>(() => {
    const areaId = this.areaId();
    if (areaId) {
      return this.content.getPlacesByArea(areaId);
    }
    const areaIds = new Set(this.areas().map(a => a.id));
    return this.content.getPlaces().filter(p => areaIds.has(p.areaId));
  });

  protected readonly items = computed<PlaceVm[]>(() => {
    const query = this.query().trim().toLowerCase();
    const filter = this.statusFilter();

    return this.basePlaces()
      .map(place => this.toVm(place))
      .filter(vm => {
        if (query) {
          const haystack = `${vm.place.name} ${vm.place.nameLocal ?? ''} ${vm.areaName}`.toLowerCase();
          if (!haystack.includes(query)) {
            return false;
          }
        }
        switch (filter) {
          case 'favorite':
            return vm.favorite;
          case 'visited':
            return vm.status === 'visited';
          case 'todo':
            return vm.status !== 'visited' && vm.status !== 'not-wanted';
          default:
            return true;
        }
      })
      .sort((a, b) => this.rank(a) - this.rank(b));
  });

  /** Photo spots are suggested for the selected area. */
  protected readonly photoSpots = computed<PhotoSpotVm[]>(() => {
    const areaId = this.areaId();
    if (!areaId) {
      return [];
    }
    return this.content.getPhotoSpotsByArea(areaId).map(spot => ({
      spot,
      time: spot.bestTime ? PHOTO_TIME_LABELS[spot.bestTime] : null,
      difficulty: spot.difficulty ? PHOTO_DIFFICULTY_LABELS[spot.difficulty] : null,
      detour: spot.estimatedDetourMin ? `+${spot.estimatedDetourMin} мин в сторону` : null,
      done: this.userState.getPhotoSpotState(spot.id)?.status === 'done',
    }));
  });

  protected readonly hasFilters = computed(
    () =>
      this.cityId() !== null ||
      this.areaId() !== null ||
      this.query() !== '' ||
      this.statusFilter() !== 'all',
  );

  protected selectCity(cityId: string | null): void {
    this.cityId.set(cityId);
    const areaId = this.areaId();
    if (areaId && cityId && this.content.getCityIdForArea(areaId) !== cityId) {
      this.areaId.set(null);
    }
  }

  protected selectArea(areaId: string | null): void {
    this.areaId.set(areaId);
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected openEditor(place: Place | null): void {
    this.editor.set({ place });
  }

  protected closeEditor(): void {
    this.editor.set(null);
  }

  /** Jump to the saved place so it is visible even if the filters would hide it. */
  protected onSaved(placeId: string): void {
    const place = this.content.getPlace(placeId);
    if (!place) {
      return;
    }
    this.cityId.set(this.content.getCityIdForArea(place.areaId) ?? null);
    this.areaId.set(place.areaId);
    this.query.set('');
    this.statusFilter.set('all');
  }

  protected resetFilters(): void {
    this.cityId.set(null);
    this.areaId.set(null);
    this.query.set('');
    this.statusFilter.set('all');
  }

  protected toggleFavorite(placeId: string): void {
    this.userState.toggleFavorite(placeId);
  }

  protected toggleStatus(vm: PlaceVm, status: PlaceUserStatus): void {
    if (vm.status === status) {
      this.userState.clearPlaceStatus(vm.place.id);
    } else {
      this.userState.setPlaceStatus(vm.place.id, status);
    }
  }

  protected scrollToPhotos(): void {
    this.document.getElementById('photo-spots')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected togglePhotoDone(vm: PhotoSpotVm): void {
    this.userState.setPhotoStatus(vm.spot.id, vm.done ? 'want' : 'done');
  }

  private toVm(place: Place): PlaceVm {
    const area = this.content.getArea(place.areaId);
    const city = area ? this.content.getCity(area.cityId) : undefined;
    const state = this.userState.getPlaceState(place.id);
    const hours = place.schedule.openingHours;
    const category = CATEGORY_LABELS[place.category];

    return {
      place,
      icon: category.icon,
      categoryLabel: category.label,
      areaName: area?.name ?? '',
      cityName: city?.name ?? '',
      duration: formatDuration(place.recommendedDurationMin),
      hours: hours ? `${hours.from}–${hours.to}` : (place.schedule.hoursText ?? null),
      mapsUrl:
        place.googleMapsUrl ??
        `https://www.google.com/maps/search/?api=1&query=${place.coordinates.lat},${place.coordinates.lng}`,
      photos: place.photos ?? [],
      address: place.address ?? null,
      website: place.website ?? null,
      sources: place.sources?.length ? place.sources.join(' · ') : null,
      custom: place.id.startsWith('u-'),
      status: state?.status ?? null,
      favorite: state?.isFavorite ?? false,
    };
  }

  /** Must-see first, places marked "not wanted" last. */
  private rank(vm: PlaceVm): number {
    return (vm.place.priority === 'must' ? 0 : 1) + (vm.status === 'not-wanted' ? 10 : 0);
  }
}
