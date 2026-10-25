import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';

import { City, Country, Place, PlaceCategory, PlacePhoto } from '../../core/models';
import { ContentService } from '../../core/services/content.service';
import { EnrichmentService } from '../../core/services/enrichment.service';
import { PhotoStorageService } from '../../core/services/photo-storage.service';
import { TripStateStore } from '../../core/state/trip-state.store';
import { UserContentStore, newId } from '../../core/state/user-content.store';
import { parseMapInput } from '../../core/utils/map-link';
import { parseOpeningHours } from '../../core/utils/osm';
import { PhotoImg } from '../../shared/photo-img';
import { CATEGORY_LABELS } from './place-labels';

const NEW = '__new';
const OSM_SOURCE = '© OpenStreetMap contributors';

interface Draft {
  name: string;
  nameLocal: string;
  cityId: string;
  newCityName: string;
  countryId: string;
  newCountryName: string;
  areaId: string;
  newAreaName: string;
  category: PlaceCategory;
  must: boolean;
  duration: string;
  description: string;
  lat: string;
  lng: string;
  googleMapsUrl: string;
  address: string;
  website: string;
  hoursText: string;
}

type TextKey = Exclude<keyof Draft, 'must' | 'category'>;

interface PhotoItem {
  photo: PlacePhoto;
  /** Not stored yet: written to IndexedDB on save. */
  blob?: Blob;
  previewUrl?: string;
}

type Status = { kind: 'info' | 'ok' | 'error'; text: string } | null;

@Component({
  selector: 'app-place-editor',
  imports: [PhotoImg],
  templateUrl: './place-editor.html',
  styleUrl: './place-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceEditor {
  private readonly content = inject(ContentService);
  private readonly store = inject(UserContentStore);
  private readonly tripState = inject(TripStateStore);
  private readonly enrichment = inject(EnrichmentService);
  private readonly photoStore = inject(PhotoStorageService);

  /** The place being edited, or null to create a new one. */
  readonly place = input<Place | null>(null);
  readonly defaults = input<{ cityId: string | null; areaId: string | null }>({ cityId: null, areaId: null });

  readonly saved = output<string>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly NEW = NEW;
  protected readonly categories = Object.entries(CATEGORY_LABELS).map(([value, v]) => ({ value: value as PlaceCategory, label: `${v.icon} ${v.label}` }));

  protected readonly draft = signal<Draft>(this.emptyDraft());
  protected readonly items = signal<PhotoItem[]>([]);
  protected readonly linkInput = signal('');
  protected readonly status = signal<Status>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmDelete = signal(false);

  private categoryTouched = false;
  private usedOsm = false;
  private originalPhotoIds: string[] = [];

  protected readonly isEdit = computed(() => this.place() !== null);
  protected readonly cities = computed<City[]>(() => this.content.getCities());
  protected readonly countries = computed<Country[]>(() => this.content.getCountries());
  protected readonly areas = computed(() => {
    const cityId = this.draft().cityId;
    return cityId && cityId !== NEW ? this.content.getAreasByCity(cityId) : [];
  });
  protected readonly coordsValid = computed(() => this.parseCoords() !== null);

  constructor() {
    afterNextRender(() => {
      this.loadInitial();
      this.dialog().nativeElement.showModal();
    });
  }

  // ---- form handlers -----------------------------------------------------
  protected onText(key: TextKey, event: Event): void {
    this.draft.update(d => ({ ...d, [key]: (event.target as HTMLInputElement).value }));
  }

  protected onCity(event: Event): void {
    const cityId = (event.target as HTMLSelectElement).value;
    this.draft.update(d => ({ ...d, cityId, areaId: cityId === NEW ? NEW : '' }));
  }

  protected onArea(event: Event): void {
    this.draft.update(d => ({ ...d, areaId: (event.target as HTMLSelectElement).value }));
  }

  protected onCategory(event: Event): void {
    this.categoryTouched = true;
    this.draft.update(d => ({ ...d, category: (event.target as HTMLSelectElement).value as PlaceCategory }));
  }

  protected onMust(event: Event): void {
    this.draft.update(d => ({ ...d, must: (event.target as HTMLInputElement).checked }));
  }

  protected onLink(event: Event): void {
    this.linkInput.set((event.target as HTMLInputElement).value);
  }

  // ---- link import + enrichment -----------------------------------------
  protected async fillFromLink(): Promise<void> {
    const parsed = parseMapInput(this.linkInput());

    if (parsed.kind === 'short') {
      this.status.set({ kind: 'error', text: 'Короткие ссылки браузер раскрыть не может. Откройте ссылку, скопируйте полный адрес из адресной строки и вставьте его.' });
      return;
    }
    if (parsed.kind === 'unknown') {
      this.status.set({ kind: 'error', text: 'Не похоже на ссылку Google Maps или координаты.' });
      return;
    }

    this.draft.update(d => ({
      ...d,
      name: d.name || parsed.name || '',
      lat: parsed.lat !== undefined ? String(parsed.lat) : d.lat,
      lng: parsed.lng !== undefined ? String(parsed.lng) : d.lng,
      googleMapsUrl: parsed.kind === 'google' ? parsed.url ?? d.googleMapsUrl : d.googleMapsUrl,
    }));

    if (parsed.lat === undefined || parsed.lng === undefined) {
      this.status.set({ kind: 'info', text: 'В ссылке нет координат. Откройте точку на карте, выберите место и скопируйте ссылку ещё раз, либо введите координаты вручную.' });
      return;
    }

    this.suggestAreaFor(parsed.lat, parsed.lng);
    await this.enrich();
  }

  protected async enrich(): Promise<void> {
    const coords = this.parseCoords();
    if (!coords) {
      this.status.set({ kind: 'error', text: 'Сначала укажите координаты.' });
      return;
    }
    this.busy.set(true);
    this.status.set({ kind: 'info', text: 'Ищу данные в OpenStreetMap и Wikimedia…' });

    try {
      const result = await this.enrichment.enrich({ name: this.draft().name || undefined, ...coords });
      const found: string[] = [];

      if (result.osm) {
        const o = result.osm;
        this.usedOsm = true;
        this.draft.update(d => ({
          ...d,
          name: d.name || o.name || '',
          nameLocal: d.nameLocal || o.nameLocal || '',
          address: d.address || o.address || '',
          website: d.website || o.website || '',
          hoursText: d.hoursText || o.parsedHours?.hoursText || '',
          category: this.categoryTouched || !result.matched ? d.category : o.category,
        }));
        if (o.address) found.push('адрес');
        if (o.parsedHours) found.push('часы работы');
        if (o.website) found.push('сайт');
      }

      if (result.photo) {
        const info = result.photo;
        const already = this.items().some(i => i.photo.sourceUrl && i.photo.sourceUrl === info.sourceUrl);
        if (!already) {
          this.items.update(list => [
            ...list,
            {
              photo: { id: newId('photo'), source: 'commons', url: info.url, credit: info.credit, license: info.license, sourceUrl: info.sourceUrl, caption: info.title },
              blob: result.photoBlob,
              previewUrl: result.photoBlob ? URL.createObjectURL(result.photoBlob) : info.url,
            },
          ]);
        }
        found.push('фото');
      }

      const text = found.length
        ? `Найдено: ${found.join(', ')}. Проверьте и поправьте при необходимости.`
        : result.messages[0] ?? 'Дополнительных данных не нашлось.';
      this.status.set({ kind: found.length ? 'ok' : 'info', text: [text, ...(found.length ? result.messages : [])].join(' ') });
    } finally {
      this.busy.set(false);
    }
  }

  protected locate(): void {
    if (!navigator.geolocation) {
      this.status.set({ kind: 'error', text: 'Геолокация недоступна на этом устройстве.' });
      return;
    }
    this.status.set({ kind: 'info', text: 'Определяю местоположение…' });
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = Math.round(pos.coords.latitude * 1e6) / 1e6;
        const lng = Math.round(pos.coords.longitude * 1e6) / 1e6;
        this.draft.update(d => ({ ...d, lat: String(lat), lng: String(lng) }));
        this.suggestAreaFor(lat, lng);
        this.status.set({ kind: 'ok', text: 'Координаты заполнены. Можно нажать «Дотянуть данные».' });
      },
      () => this.status.set({ kind: 'error', text: 'Не удалось определить местоположение. Разрешите доступ или введите координаты.' }),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  // ---- photos ------------------------------------------------------------
  protected async onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const file of files) {
      const blob = await this.photoStore.compress(file);
      this.items.update(list => [
        ...list,
        { photo: { id: newId('photo'), source: 'user' }, blob, previewUrl: URL.createObjectURL(blob) },
      ]);
    }
  }

  protected removePhoto(id: string): void {
    this.items.update(list => {
      const item = list.find(i => i.photo.id === id);
      if (item?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return list.filter(i => i.photo.id !== id);
    });
  }

  // ---- save / delete -----------------------------------------------------
  protected async save(): Promise<void> {
    const d = this.draft();
    const coords = this.parseCoords();

    if (!d.name.trim()) {
      return this.fail('Введите название.');
    }
    if (!coords) {
      return this.fail('Укажите координаты: вставьте ссылку Google Maps, нажмите «Моё местоположение» или введите их вручную.');
    }
    if (!d.cityId) {
      return this.fail('Выберите город.');
    }
    if (d.cityId === NEW && !d.newCityName.trim()) {
      return this.fail('Введите название нового города.');
    }
    if (d.cityId === NEW && !d.countryId) {
      return this.fail('Выберите страну.');
    }
    if (d.cityId === NEW && d.countryId === NEW && !d.newCountryName.trim()) {
      return this.fail('Введите название страны.');
    }
    if (!d.areaId) {
      return this.fail('Выберите район.');
    }
    if (d.areaId === NEW && !d.newAreaName.trim() && d.cityId !== NEW) {
      return this.fail('Введите название нового района.');
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      // 1. location hierarchy
      let countryId = d.countryId;
      if (d.cityId === NEW && countryId === NEW) {
        countryId = newId('country');
        this.store.upsert('countries', { id: countryId, name: d.newCountryName.trim() });
      }

      let cityId = d.cityId;
      if (cityId === NEW) {
        cityId = newId('city');
        const sibling = this.content.getCitiesByCountry(countryId)[0];
        this.store.upsert('cities', {
          id: cityId,
          countryId,
          name: d.newCityName.trim(),
          timezone: sibling?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      }

      let areaId = d.areaId;
      if (areaId === NEW) {
        areaId = newId('area');
        const areaName = d.newAreaName.trim() || d.newCityName.trim();
        this.store.upsert('areas', { id: areaId, cityId, name: areaName });
      }

      // 2. make sure the trip includes this city, otherwise the place would be invisible
      const trip = this.tripState.trip();
      if (trip && !trip.cityIds.includes(cityId)) {
        this.store.upsert('trips', { ...trip, cityIds: [...trip.cityIds, cityId] });
      }

      // 3. photos: write new blobs, drop removed ones
      const items = this.items();
      for (const item of items) {
        if (item.blob) {
          await this.photoStore.put(item.photo.id, item.blob);
        }
      }
      const keptIds = new Set(items.map(i => i.photo.id));
      for (const id of this.originalPhotoIds.filter(id => !keptIds.has(id))) {
        await this.photoStore.delete(id);
      }

      // 4. the place itself
      const existing = this.place();
      const hours = d.hoursText.trim() ? parseOpeningHours(d.hoursText.replace(/[–—]/g, '-')) : null;
      const sources = new Set(existing?.sources ?? []);
      if (this.usedOsm) {
        sources.add(OSM_SOURCE);
      }
      const duration = Number(d.duration);

      const place: Place = {
        id: existing?.id ?? newId('place'),
        name: d.name.trim(),
        category: d.category,
        priority: d.must ? 'must' : 'optional',
        areaId,
        coordinates: coords,
        schedule: {
          ...(existing?.schedule ?? { weekdays: null, openingHours: null }),
          weekdays: hours?.weekdays ?? null,
          openingHours: hours?.openingHours ?? null,
          hoursText: hours && !hours.openingHours ? hours.hoursText : undefined,
        },
      };
      if (d.nameLocal.trim()) place.nameLocal = d.nameLocal.trim();
      if (d.description.trim()) place.description = d.description.trim();
      if (Number.isFinite(duration) && duration > 0) place.recommendedDurationMin = Math.round(duration);
      if (d.address.trim()) place.address = d.address.trim();
      if (d.website.trim()) place.website = d.website.trim();
      if (d.googleMapsUrl.trim()) place.googleMapsUrl = d.googleMapsUrl.trim();
      if (existing?.tags) place.tags = existing.tags;
      if (items.length) place.photos = items.map(i => i.photo);
      if (sources.size) place.sources = [...sources];

      this.store.upsert('places', place);
      this.saved.emit(place.id);
      this.close();
    } finally {
      this.busy.set(false);
    }
  }

  protected remove(): void {
    const place = this.place();
    if (!place) {
      return;
    }
    if (!this.confirmDelete()) {
      this.confirmDelete.set(true);
      return;
    }
    this.store.remove('places', place.id);
    this.close();
  }

  protected close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) {
      el.close();
    }
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.close();
    }
  }

  protected onClosed(): void {
    for (const item of this.items()) {
      if (item.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(item.previewUrl);
      }
    }
    this.closed.emit();
  }

  // ---- helpers -----------------------------------------------------------
  private fail(message: string): void {
    this.error.set(message);
  }

  private parseCoords(): { lat: number; lng: number } | null {
    const d = this.draft();
    const lat = Number(d.lat.replace(',', '.'));
    const lng = Number(d.lng.replace(',', '.'));
    if (!d.lat.trim() || !d.lng.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  }

  private suggestAreaFor(lat: number, lng: number): void {
    const d = this.draft();
    if (d.areaId) {
      return;
    }
    const area = this.content.suggestArea(lat, lng);
    if (area) {
      this.draft.update(x => ({ ...x, cityId: area.cityId, areaId: area.id }));
    }
  }

  private emptyDraft(): Draft {
    return {
      name: '', nameLocal: '', cityId: '', newCityName: '', countryId: '', newCountryName: '',
      areaId: '', newAreaName: '', category: 'other', must: false, duration: '', description: '',
      lat: '', lng: '', googleMapsUrl: '', address: '', website: '', hoursText: '',
    };
  }

  private loadInitial(): void {
    const place = this.place();
    if (place) {
      const area = this.content.getArea(place.areaId);
      const hours = place.schedule.openingHours
        ? `${place.schedule.openingHours.from}-${place.schedule.openingHours.to}`
        : place.schedule.hoursText ?? '';
      this.categoryTouched = true;
      this.originalPhotoIds = (place.photos ?? []).map(p => p.id);
      this.items.set((place.photos ?? []).map(photo => ({ photo })));
      this.draft.set({
        ...this.emptyDraft(),
        name: place.name,
        nameLocal: place.nameLocal ?? '',
        cityId: area?.cityId ?? '',
        areaId: place.areaId,
        category: place.category,
        must: place.priority === 'must',
        duration: place.recommendedDurationMin ? String(place.recommendedDurationMin) : '',
        description: place.description ?? '',
        lat: String(place.coordinates.lat),
        lng: String(place.coordinates.lng),
        googleMapsUrl: place.googleMapsUrl ?? '',
        address: place.address ?? '',
        website: place.website ?? '',
        hoursText: hours,
      });
      return;
    }

    const { cityId, areaId } = this.defaults();
    this.draft.set({ ...this.emptyDraft(), cityId: cityId ?? '', areaId: areaId ?? '' });
  }
}
