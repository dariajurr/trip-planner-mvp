import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { Area, PhotoSpot, Place, PlaceUserStatus } from '../../core/models';
import { ContentService } from '../../core/services/content.service';
import { TripStateStore } from '../../core/state/trip-state.store';
import { UserStateStore } from '../../core/state/user-state.store';
import { PlaceCard } from '../../shared/place/place-card';
import { PlaceViewService, PlaceVm } from '../../core/services/place-view.service';
import { PlaceEditor } from './place-editor';
import { PlaceSheet } from './place-sheet';
import { PhotoViewer } from '../../shared/place/photo-viewer';
import { PHOTO_DIFFICULTY_LABELS, PHOTO_TIME_LABELS } from './place-labels';

type StatusFilter = 'all' | 'favorite' | 'todo' | 'visited';

interface PhotoSpotVm {
  spot: PhotoSpot;
  time: string | null;
  difficulty: string | null;
  detour: string | null;
  done: boolean;
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'favorite', label: '♥ Избранное' },
  { value: 'todo', label: 'Осталось' },
  { value: 'visited', label: 'Были' },
];

@Component({
  selector: 'app-places-page',
  imports: [PlaceCard, PlaceEditor, PlaceSheet, PhotoViewer],
  templateUrl: './places-page.html',
  styleUrl: './places-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlacesPage {
  private readonly content = inject(ContentService);
  private readonly tripState = inject(TripStateStore);
  private readonly userState = inject(UserStateStore);
  private readonly document = inject(DOCUMENT);
  private readonly placeView = inject(PlaceViewService);

  protected readonly statusFilters = STATUS_FILTERS;

  protected readonly cities = this.tripState.cities;

  protected readonly cityId = signal<string | null>(null);
  protected readonly areaId = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly statusFilter = signal<StatusFilter>('all');

  /** The place whose details are open. */
  protected readonly sheetId = signal<string | null>(null);
  protected readonly viewer = signal<{ vm: PlaceVm; index: number } | null>(null);

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
      .map(place => this.placeView.vm(place))
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

  protected openPhoto(vm: PlaceVm, index: number): void {
    this.viewer.set({ vm, index });
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

  /** Must-see first, places marked "not wanted" last. */
  private rank(vm: PlaceVm): number {
    return (vm.place.priority === 'must' ? 0 : 1) + (vm.status === 'not-wanted' ? 10 : 0);
  }
}
