import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Trip } from '../../core/models';
import { BookingImportService, ImportedDocument } from '../../core/services/booking-import.service';
import { BookingService, EditableDraft } from '../../core/services/booking.service';
import { ContentService } from '../../core/services/content.service';
import { TripSaved, TripService } from '../../core/services/trip.service';
import { TripStateStore } from '../../core/state/trip-state.store';
import { BookingEditor } from '../bookings/booking-editor';
import { daysBetween, formatShort } from '../../core/utils/dates';
import { draftToBooking } from '../../core/utils/booking-utils';
import { Destination, TripPhase, TripSuggestion, groupTrips, inferTripFromBookings, tripLength } from '../../core/utils/trip-utils';
import { TripEditor, TripPrefill } from './trip-editor';

interface TripVm {
  trip: Trip;
  phase: TripPhase;
  when: string;
  length: string;
  status: string;
  cities: string;
  bookings: number;
  assignments: number;
  selected: boolean;
}

const SECTIONS: { phase: TripPhase; title: string }[] = [
  { phase: 'current', title: 'Идёт сейчас' },
  { phase: 'upcoming', title: 'Предстоящие' },
  { phase: 'past', title: 'Прошедшие' },
];

const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;

@Component({
  selector: 'app-trips-page',
  imports: [BookingEditor, TripEditor],
  templateUrl: './trips-page.html',
  styleUrl: './trips-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripsPage {
  private readonly content = inject(ContentService);
  private readonly tripState = inject(TripStateStore);
  private readonly tripService = inject(TripService);
  private readonly bookingSvc = inject(BookingService);
  private readonly importer = inject(BookingImportService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);
  protected readonly confirmId = signal<string | null>(null);

  /** The trip form: null = closed. `trip` set = editing. */
  protected readonly form = signal<{ trip: Trip | null; prefill: TripPrefill | null; note: string | null } | null>(null);
  /** Step 1 of "from documents": check what was read. */
  protected readonly review = signal<{ items: EditableDraft[]; documents: ImportedDocument[] } | null>(null);

  /** Bookings read from documents wait here until the trip they belong to is saved. */
  private waiting: { items: EditableDraft[]; suggestion: TripSuggestion | null } | null = null;

  protected readonly sections = computed(() => {
    const today = this.tripState.today;
    const groups = groupTrips(this.tripState.trips(), today);
    const selected = this.tripState.trip()?.id;

    return SECTIONS.map(s => ({
      title: s.title,
      items: groups[s.phase].map<TripVm>(trip => {
        const summary = this.tripService.summary(trip.id);
        const cityNames = this.content.getTripCities(trip.id).map(c => c.name).join(', ');
        const length = tripLength(trip);
        const day = daysBetween(trip.startDate, today) + 1;
        return {
          trip,
          phase: s.phase,
          when: `${formatShort(trip.startDate)} – ${formatShort(trip.endDate)} ${trip.endDate.slice(0, 4)}`,
          length: `${length} ${plural(length, 'день', 'дня', 'дней')}`,
          status:
            s.phase === 'current'
              ? `идёт, день ${day} из ${length}`
              : s.phase === 'upcoming'
                ? `через ${daysBetween(today, trip.startDate)} дн.`
                : 'завершена',
          cities: cityNames || 'города не выбраны',
          bookings: summary.bookings,
          assignments: summary.assignments,
          selected: trip.id === selected,
        };
      }),
    })).filter(s => s.items.length);
  });

  protected readonly count = computed(() => this.tripState.trips().length);

  protected open(trip: Trip): void {
    this.tripState.selectTrip(trip.id);
    void this.router.navigate(['/days']);
  }

  protected choose(trip: Trip): void {
    this.tripState.selectTrip(trip.id);
  }

  protected newTrip(): void {
    this.form.set({ trip: null, prefill: null, note: null });
  }

  protected edit(trip: Trip): void {
    this.form.set({ trip, prefill: null, note: null });
  }

  protected deleteText(vm: TripVm): string {
    const parts: string[] = [];
    if (vm.bookings) parts.push(`брони: ${vm.bookings}`);
    if (vm.assignments) parts.push(`маршруты по дням: ${vm.assignments}`);
    return parts.length ? `Будет удалено: ${parts.join(', ')}. Точки, маршруты и фото останутся.` : 'У поездки нет броней и маршрутов по дням. Точки, маршруты и фото останутся.';
  }

  protected async remove(vm: TripVm): Promise<void> {
    if (this.confirmId() !== vm.trip.id) {
      this.confirmId.set(vm.trip.id);
      return;
    }
    this.confirmId.set(null);
    await this.tripService.remove(vm.trip.id);
    this.message.set({ kind: 'ok', text: `Поездка «${vm.trip.title}» удалена.` });
  }

  // ---- create from booking documents ------------------------------------------
  protected async onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;

    this.message.set(null);
    this.busy.set(true);
    try {
      const documents: ImportedDocument[] = [];
      for (const file of files) documents.push(await this.importer.readFile(file, { defaultYear: new Date().getFullYear() }));
      const items = documents.flatMap(doc => doc.drafts.map(draft => ({ draft, include: true, file: doc.file })));
      this.review.set({ items, documents });
    } catch (e) {
      console.error('[trips] import failed', e);
      this.message.set({ kind: 'error', text: 'Не удалось обработать файлы.' });
    } finally {
      this.busy.set(false);
    }
  }

  /** Step 2: the bookings were checked; work out the trip they describe and let the user adjust it. */
  protected onReviewed(items: EditableDraft[]): void {
    const chosen = items.filter(i => i.include);
    const suggestion = inferTripFromBookings(chosen.map((item, i) => draftToBooking(item.draft, { id: `tmp-${i}`, tripId: 'tmp' })));
    this.waiting = { items: chosen, suggestion };
    this.form.set({
      trip: null,
      prefill: suggestion ? { title: suggestion.title, startDate: suggestion.startDate, endDate: suggestion.endDate, cities: suggestion.cities } : null,
      note: suggestion ? null : 'По броням не удалось определить даты поездки. Заполните их вручную.',
    });
  }

  /** Step 3 (or the plain form): the trip is saved; bookings that were waiting now join it. */
  protected async onSaved(result: TripSaved): Promise<void> {
    const waiting = this.waiting;
    const wasEdit = !!this.form()?.trip;
    this.waiting = null;

    if (waiting) {
      this.busy.set(true);
      try {
        const items = waiting.items.map(item =>
          item.draft.kind === 'hotel' ? { ...item, draft: { ...item.draft, cityId: this.cityOfStay(item.draft.checkInDate, item.draft.checkOutDate, waiting.suggestion?.destinations ?? [], result) } } : item,
        );
        const saved = await this.bookingSvc.commit(items, result.tripId);
        this.message.set({ kind: 'ok', text: `Поездка создана, броней: ${saved.length}.` });
      } finally {
        this.busy.set(false);
      }
    }

    if (!wasEdit) {
      this.tripState.selectTrip(result.tripId);
      void this.router.navigate(['/days']);
    }
  }

  protected onFormClosed(): void {
    this.form.set(null);
    this.waiting = null; // cancelled: nothing from the documents is saved
  }

  /** A hotel whose stay lies within a destination's stay belongs to that city. */
  private cityOfStay(checkIn: string, checkOut: string, destinations: Destination[], result: TripSaved): string | undefined {
    const stay = destinations.find(d => d.arrival.date <= checkIn && (d.departure?.date ?? '9999-12-31') >= checkOut);
    return stay ? result.cityIdByName[stay.city.toLowerCase()] : undefined;
  }
}
