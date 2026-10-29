import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';

import { Trip } from '../../core/models';
import { ContentService } from '../../core/services/content.service';
import { NewCity, TripSaved, TripService } from '../../core/services/trip.service';

export interface TripPrefill {
  title: string;
  startDate: string;
  endDate: string;
  cities: { name: string; countryCode: string }[];
}

const NEW = '__new';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Create or change a trip: name, dates and the cities it covers (existing ones, or new ones created with it). */
@Component({
  selector: 'app-trip-editor',
  templateUrl: './trip-editor.html',
  styleUrl: './trip-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripEditor {
  private readonly content = inject(ContentService);
  private readonly trips = inject(TripService);

  readonly trip = input<Trip | null>(null);
  /** Values suggested from booking documents. */
  readonly prefill = input<TripPrefill | null>(null);
  readonly note = input<string | null>(null);

  readonly saved = output<TripSaved>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly NEW = NEW;
  protected readonly title = signal('');
  protected readonly startDate = signal('');
  protected readonly endDate = signal('');
  protected readonly selected = signal<string[]>([]);
  protected readonly pending = signal<NewCity[]>([]);
  protected readonly adding = signal(false);
  protected readonly miniName = signal('');
  protected readonly miniCountry = signal('');
  protected readonly miniCountryName = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly isEdit = computed(() => this.trip() !== null);
  protected readonly countries = computed(() => this.content.getCountries());
  protected readonly cityOptions = computed(() =>
    this.content
      .getCities()
      .map(c => ({ id: c.id, name: c.name, country: this.content.getCountry(c.countryId)?.name ?? '' }))
      .sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name)),
  );

  constructor() {
    afterNextRender(() => {
      this.load();
      this.dialog().nativeElement.showModal();
    });
  }

  protected on(target: { set(v: string): void }, event: Event): void {
    target.set((event.target as HTMLInputElement | HTMLSelectElement).value);
  }

  protected toggleCity(id: string): void {
    this.selected.update(list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]));
  }

  protected removePending(index: number): void {
    this.pending.update(list => list.filter((_, i) => i !== index));
  }

  protected addCity(): void {
    const name = this.miniName().trim();
    const country = this.miniCountry();
    if (!name) return this.fail('Введите название города.');
    if (!country) return this.fail('Выберите страну города.');
    if (country === NEW && !this.miniCountryName().trim()) return this.fail('Введите название страны.');

    const city: NewCity = country === NEW ? { name, countryName: this.miniCountryName().trim() } : { name, countryId: country };
    this.pending.update(list => [...list, city]);
    this.adding.set(false);
    this.miniName.set('');
    this.miniCountryName.set('');
    this.error.set(null);
  }

  protected pendingLabel(c: NewCity): string {
    const country = c.countryId ? this.content.getCountry(c.countryId)?.name : c.countryName;
    return `${c.name}${country ? ', ' + country : ''}`;
  }

  protected async save(): Promise<void> {
    const title = this.title().trim();
    if (!title) return this.fail('Введите название поездки.');
    if (!ISO.test(this.startDate()) || !ISO.test(this.endDate())) return this.fail('Укажите даты начала и конца.');
    if (this.endDate() < this.startDate()) return this.fail('Конец поездки раньше начала.');
    if (!this.selected().length && !this.pending().length) return this.fail('Выберите хотя бы один город.');

    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.trips.save(
        { title, startDate: this.startDate(), endDate: this.endDate(), cityIds: this.selected(), newCities: this.pending() },
        this.trip()?.id,
      );
      this.saved.emit(result);
      this.close();
    } finally {
      this.busy.set(false);
    }
  }

  protected close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  private fail(message: string): void {
    this.error.set(message);
  }

  private load(): void {
    const trip = this.trip();
    if (trip) {
      this.title.set(trip.title);
      this.startDate.set(trip.startDate);
      this.endDate.set(trip.endDate);
      this.selected.set([...trip.cityIds]);
      return;
    }

    const prefill = this.prefill();
    if (!prefill) return;
    this.title.set(prefill.title);
    this.startDate.set(prefill.startDate);
    this.endDate.set(prefill.endDate);

    const selected: string[] = [];
    const pending: NewCity[] = [];
    for (const c of prefill.cities) {
      const match = this.content.getCities().find(city => {
        const code = this.content.getCountry(city.countryId)?.code;
        return city.name.toLowerCase() === c.name.toLowerCase() && (!code || !c.countryCode || code === c.countryCode);
      });
      if (match) selected.push(match.id);
      else pending.push({ name: c.name, countryCode: c.countryCode });
    }
    this.selected.set(selected);
    this.pending.set(pending);
  }
}
