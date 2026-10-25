import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';

import { ContentService } from '../../core/services/content.service';
import { TripStateStore } from '../../core/state/trip-state.store';
import { distanceKm, formatKm } from '../../core/utils/route-utils';
import { CATEGORY_LABELS } from '../places/place-labels';

interface Candidate {
  id: string;
  name: string;
  icon: string;
  areaName: string;
  must: boolean;
  distance: string | null;
}

/** Dialog to add several places to a route at once; nearest to the last stop first. */
@Component({
  selector: 'app-stop-picker',
  templateUrl: './stop-picker.html',
  styleUrl: './stop-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StopPicker {
  private readonly content = inject(ContentService);
  private readonly tripState = inject(TripStateStore);

  readonly routeId = input.required<string>();
  readonly picked = output<string[]>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly query = signal('');
  protected readonly areaId = signal('');
  protected readonly selected = signal<string[]>([]);

  protected readonly areas = computed(() =>
    this.tripState.cities().flatMap(city => this.content.getAreasByCity(city.id)),
  );

  protected readonly hasAnchor = computed(() => (this.content.getRoute(this.routeId())?.stops.length ?? 0) > 0);

  protected readonly candidates = computed<Candidate[]>(() => {
    const route = this.content.getRoute(this.routeId());
    const present = new Set(route?.stops.map(s => s.placeId));
    const areaIds = new Set(this.areas().map(a => a.id));
    const q = this.query().trim().toLowerCase();
    const area = this.areaId();

    const anchorId = route?.stops[route.stops.length - 1]?.placeId;
    const anchor = anchorId ? this.content.getPlace(anchorId)?.coordinates : undefined;

    return this.content
      .getPlaces()
      .filter(p => areaIds.has(p.areaId) && !present.has(p.id) && (!area || p.areaId === area))
      .map(p => {
        const areaName = this.content.getArea(p.areaId)?.name ?? '';
        return { p, areaName, km: anchor ? distanceKm(anchor, p.coordinates) : null };
      })
      .filter(x => !q || `${x.p.name} ${x.p.nameLocal ?? ''} ${x.areaName}`.toLowerCase().includes(q))
      .sort((a, b) =>
        a.km !== null && b.km !== null
          ? a.km - b.km
          : a.areaName.localeCompare(b.areaName) || a.p.name.localeCompare(b.p.name),
      )
      .map(x => ({
        id: x.p.id,
        name: x.p.name,
        icon: CATEGORY_LABELS[x.p.category].icon,
        areaName: x.areaName,
        must: x.p.priority === 'must',
        distance: x.km !== null ? formatKm(x.km) : null,
      }));
  });

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onArea(event: Event): void {
    this.areaId.set((event.target as HTMLSelectElement).value);
  }

  protected toggle(id: string): void {
    this.selected.update(list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]));
  }

  protected orderOf(id: string): number {
    return this.selected().indexOf(id) + 1;
  }

  protected confirm(): void {
    this.picked.emit(this.selected());
    this.close();
  }

  protected close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
