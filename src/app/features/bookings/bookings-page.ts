import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { Booking, BookingAttachment, FlightBooking, HotelBooking } from '../../core/models';
import { BookingImportService, ImportedDocument } from '../../core/services/booking-import.service';
import { BookingService, EditableDraft } from '../../core/services/booking.service';
import { ContentService } from '../../core/services/content.service';
import { TripStateStore } from '../../core/state/trip-state.store';
import { airportName } from '../../core/utils/booking-utils';
import { daysBetween, formatDay, formatShort } from '../../core/utils/dates';
import { BookingEditor } from './booking-editor';

interface EditorState {
  title: string;
  items: EditableDraft[];
  documents: ImportedDocument[];
  canAdd: boolean;
}

@Component({
  selector: 'app-bookings-page',
  imports: [BookingEditor],
  templateUrl: './bookings-page.html',
  styleUrl: './bookings-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingsPage {
  protected readonly svc = inject(BookingService);
  private readonly importer = inject(BookingImportService);
  private readonly content = inject(ContentService);
  private readonly tripState = inject(TripStateStore);

  protected readonly busy = signal(false);
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);
  protected readonly editor = signal<EditorState | null>(null);
  protected readonly pasteOpen = signal(false);
  protected readonly pasteText = signal('');
  protected readonly confirmId = signal<string | null>(null);

  protected readonly flights = computed(() =>
    this.svc.bookings()
      .filter((b): b is FlightBooking => b.kind === 'flight')
      .sort((a, b) => `${a.departure.date}${a.departure.time ?? ''}`.localeCompare(`${b.departure.date}${b.departure.time ?? ''}`))
      .map(b => ({
        b,
        route: `${airportName(b.from)} → ${airportName(b.to)}`,
        dep: `${formatDay(b.departure.date)}${b.departure.time ? ', ' + b.departure.time : ''}`,
        arr: b.arrival ? `${formatDay(b.arrival.date)}${b.arrival.time ? ', ' + b.arrival.time : ''}` : null,
      })),
  );

  protected readonly hotels = computed(() =>
    this.svc.bookings()
      .filter((b): b is HotelBooking => b.kind === 'hotel')
      .sort((a, b) => a.checkIn.date.localeCompare(b.checkIn.date))
      .map(b => ({
        b,
        city: b.cityId ? this.content.getCity(b.cityId)?.name ?? '' : '',
        stay: `${formatShort(b.checkIn.date)}${b.checkIn.time ? ' (с ' + b.checkIn.time + ')' : ''} → ${formatShort(b.checkOut.date)}${b.checkOut.time ? ' (до ' + b.checkOut.time + ')' : ''}`,
        nights: Math.max(0, daysBetween(b.checkIn.date, b.checkOut.date)),
      })),
  );

  protected readonly range = computed(() => {
    const r = this.svc.rangeSuggestion();
    const trip = this.tripState.trip();
    return r && trip
      ? { text: `${formatShort(r.start)} – ${formatShort(r.end)}`, current: `${formatShort(trip.startDate)} – ${formatShort(trip.endDate)}`, value: r }
      : null;
  });

  protected async onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;

    this.message.set(null);
    this.busy.set(true);
    try {
      const docs: ImportedDocument[] = [];
      for (const file of files) docs.push(await this.importer.readFile(file, { defaultYear: this.year() }));

      const items: EditableDraft[] = docs.flatMap(doc => doc.drafts.map(draft => ({ draft, include: true, file: doc.file })));
      this.editor.set({
        title: items.length ? `Найдено: ${items.length}` : 'Ничего не найдено',
        items,
        documents: docs,
        canAdd: true,
      });
    } catch (e) {
      console.error('[bookings] import failed', e);
      this.message.set({ kind: 'error', text: `Не удалось обработать файлы (${e instanceof Error ? e.name + ': ' + e.message.slice(0, 120) : 'неизвестная ошибка'}).` });
    } finally {
      this.busy.set(false);
    }
  }

  protected analyzePaste(): void {
    const text = this.pasteText().trim();
    if (!text) return;
    const result = this.importer.readText(text, { defaultYear: this.year() });
    this.editor.set({
      title: result.drafts.length ? `Найдено: ${result.drafts.length}` : 'Ничего не найдено',
      items: result.drafts.map(draft => ({ draft, include: true })),
      documents: [{ file: new File([], 'Вставленный текст'), text: result.text, drafts: result.drafts, error: result.error }],
      canAdd: true,
    });
    this.pasteOpen.set(false);
    this.pasteText.set('');
  }

  protected edit(b: Booking): void {
    this.editor.set({ title: b.kind === 'flight' ? 'Перелёт' : 'Проживание', items: [this.svc.editable(b)], documents: [], canAdd: false });
  }

  protected addManual(): void {
    this.editor.set({ title: 'Новая бронь', items: [], documents: [], canAdd: true });
  }

  protected async onSaved(items: EditableDraft[]): Promise<void> {
    this.busy.set(true);
    try {
      // one stored copy of each uploaded document, shared by all bookings read from it
      const stored = new Map<File, BookingAttachment>();
      const withFiles: EditableDraft[] = [];
      for (const item of items) {
        if (!item.include) continue;
        let attachments = item.attachments;
        if (item.file && item.file.size > 0) {
          let a = stored.get(item.file);
          if (!a) {
            a = await this.svc.storeFile(item.file);
            stored.set(item.file, a);
          }
          attachments = [...(attachments ?? []), a];
        }
        withFiles.push({ ...item, attachments });
      }
      const saved = this.svc.save(withFiles);
      this.message.set({ kind: 'ok', text: `Сохранено: ${saved.length}.` });
    } finally {
      this.busy.set(false);
    }
  }

  protected async open(a: BookingAttachment): Promise<void> {
    if (!(await this.svc.openAttachment(a))) {
      this.message.set({ kind: 'error', text: 'Документ не найден на этом устройстве. Если бронь пришла из синхронизации, импортируйте файл с документами.' });
    }
  }

  protected async remove(b: Booking): Promise<void> {
    if (this.confirmId() !== b.id) {
      this.confirmId.set(b.id);
      return;
    }
    this.confirmId.set(null);
    await this.svc.remove(b.id);
  }

  protected applyRange(): void {
    const r = this.range();
    if (!r) return;
    this.svc.applyTripRange(r.value);
    this.message.set({ kind: 'ok', text: `Даты поездки обновлены: ${r.text}.` });
  }

  protected onPaste(event: Event): void {
    this.pasteText.set((event.target as HTMLTextAreaElement).value);
  }

  private year(): number {
    const start = this.tripState.trip()?.startDate;
    return start ? Number(start.slice(0, 4)) : new Date().getFullYear();
  }
}
