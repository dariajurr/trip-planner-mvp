import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';

import { EditableDraft } from '../../core/services/booking.service';
import { ImportedDocument } from '../../core/services/booking-import.service';
import { TripStateStore } from '../../core/state/trip-state.store';
import { BookingDraft, FlightDraft, HotelDraft } from '../../core/utils/booking-parser';
import { draftErrors } from '../../core/utils/booking-utils';

const blankFlight = (): FlightDraft => ({ kind: 'flight', flightNumber: '', airline: '', from: '', to: '', depDate: '', depTime: '', arrDate: '', arrTime: '', confirmation: '', warnings: [] });
const blankHotel = (): HotelDraft => ({ kind: 'hotel', name: '', address: '', checkInDate: '', checkInTime: '', checkOutDate: '', checkOutTime: '', confirmation: '', cityId: '', warnings: [] });

/** Review and edit bookings: read from documents, typed in by hand, or existing ones. */
@Component({
  selector: 'app-booking-editor',
  templateUrl: './booking-editor.html',
  styleUrl: './booking-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingEditor {
  private readonly tripState = inject(TripStateStore);

  readonly title = input('Проверьте данные');
  readonly initial = input.required<EditableDraft[]>();
  /** Documents the drafts came from (for messages and the raw text). */
  readonly documents = input<ImportedDocument[]>([]);
  readonly canAdd = input(true);
  /** Hide the hotel city field (when the trip the bookings belong to does not exist yet). */
  readonly withCity = input(true);

  readonly saved = output<EditableDraft[]>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly items = signal<EditableDraft[]>([]);
  protected readonly errors = signal<Record<number, string[]>>({});

  protected errorsFor(index: number): string[] {
    return this.errors()[index] ?? [];
  }
  protected readonly copied = signal(false);
  protected readonly cities = computed(() => this.tripState.cities());

  protected readonly docProblems = computed(() => this.documents().filter(d => d.error));

  constructor() {
    afterNextRender(() => {
      this.items.set(this.initial());
      this.dialog().nativeElement.showModal();
    });
  }

  protected set(index: number, key: string, event: Event): void {
    let value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    if (key === 'from' || key === 'to') value = value.toUpperCase().slice(0, 3);
    this.patch(index, { [key]: value });
  }

  protected toggle(index: number, event: Event): void {
    const include = (event.target as HTMLInputElement).checked;
    this.items.update(list => list.map((it, i) => (i === index ? { ...it, include } : it)));
  }

  protected remove(index: number): void {
    this.items.update(list => list.filter((_, i) => i !== index));
    this.errors.set({});
  }

  protected add(kind: 'flight' | 'hotel'): void {
    this.items.update(list => [...list, { draft: kind === 'flight' ? blankFlight() : blankHotel(), include: true }]);
  }

  protected asFlight(d: BookingDraft): FlightDraft | null {
    return d.kind === 'flight' ? d : null;
  }

  protected asHotel(d: BookingDraft): HotelDraft | null {
    return d.kind === 'hotel' ? d : null;
  }

  protected readonly chosen = computed(() => this.items().filter(i => i.include).length);

  protected save(): void {
    const problems: Record<number, string[]> = {};
    this.items().forEach((it, i) => {
      if (it.include) {
        const e = draftErrors(it.draft);
        if (e.length) problems[i] = e;
      }
    });
    this.errors.set(problems);
    if (Object.keys(problems).length || !this.chosen()) return;

    this.saved.emit(this.items());
    this.close();
  }

  protected async copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // clipboard may be blocked: the text is selectable on screen
    }
  }

  protected close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  private patch(index: number, partial: Record<string, string>): void {
    this.items.update(list =>
      list.map((it, i) => (i === index ? { ...it, draft: { ...it.draft, ...partial } as BookingDraft } : it)),
    );
  }
}
