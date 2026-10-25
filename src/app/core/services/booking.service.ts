import { Injectable, computed, inject } from '@angular/core';

import { Booking, BookingAttachment } from '../models';
import { TripStateStore } from '../state/trip-state.store';
import { UserContentStore, newId } from '../state/user-content.store';
import { BookingDraft } from '../utils/booking-parser';
import { bookingToDraft, draftToBooking, suggestTripRange } from '../utils/booking-utils';
import { ContentService } from './content.service';
import { PhotoStorageService } from './photo-storage.service';

export interface EditableDraft {
  draft: BookingDraft;
  /** Set when an existing booking is being edited. */
  id?: string;
  attachments?: BookingAttachment[];
  /** Unchecked drafts are not saved. */
  include: boolean;
  /** The uploaded document this draft was read from; stored with the booking on save. */
  file?: File;
}

/** Saving, deleting and attaching documents to bookings of the selected trip. */
@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly content = inject(ContentService);
  private readonly store = inject(UserContentStore);
  private readonly tripState = inject(TripStateStore);
  private readonly files = inject(PhotoStorageService);

  readonly bookings = computed<Booking[]>(() => {
    const trip = this.tripState.trip();
    return trip ? this.content.getBookings(trip.id) : [];
  });

  /** Trip dates implied by the bookings, if they differ from the current ones. */
  readonly rangeSuggestion = computed(() => {
    const trip = this.tripState.trip();
    if (!trip) return null;
    const countries = this.tripState.countries().map(c => c.code).filter((c): c is string => !!c);
    const range = suggestTripRange(this.bookings(), countries);
    return range && (range.start !== trip.startDate || range.end !== trip.endDate) ? range : null;
  });

  editable(b: Booking): EditableDraft {
    return { draft: bookingToDraft(b), id: b.id, attachments: b.attachments, include: true };
  }

  /** Stores the original document on the device and returns its description. */
  async storeFile(file: File): Promise<BookingAttachment> {
    const id = newId('doc');
    await this.files.put(id, file);
    return { id, name: file.name, mime: file.type || 'application/octet-stream', size: file.size };
  }

  async openAttachment(a: BookingAttachment): Promise<boolean> {
    const blob = await this.files.get(a.id);
    if (!blob) return false;
    const url = URL.createObjectURL(new Blob([blob], { type: a.mime }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  }

  /** Saves the drafts that are included; drafts with an id replace the existing booking. */
  save(items: EditableDraft[]): Booking[] {
    const trip = this.tripState.trip();
    if (!trip) return [];

    const saved: Booking[] = [];
    for (const item of items.filter(i => i.include)) {
      const booking = draftToBooking(item.draft, {
        id: item.id ?? newId('booking'),
        tripId: trip.id,
        attachments: item.attachments,
        notes: item.id ? this.content.getBooking(item.id)?.notes : undefined,
      });
      this.store.upsert('bookings', booking);
      saved.push(booking);
    }
    return saved;
  }

  async remove(id: string): Promise<void> {
    const booking = this.content.getBooking(id);
    this.store.remove('bookings', id);

    // delete the stored documents that no other booking still uses
    for (const a of booking?.attachments ?? []) {
      const stillUsed = this.bookings().some(b => b.id !== id && b.attachments?.some(x => x.id === a.id));
      if (!stillUsed) await this.files.delete(a.id);
    }
  }

  applyTripRange(range: { start: string; end: string }): void {
    const trip = this.tripState.trip();
    if (trip) {
      this.store.upsert('trips', { ...trip, startDate: range.start, endDate: range.end });
    }
  }
}
