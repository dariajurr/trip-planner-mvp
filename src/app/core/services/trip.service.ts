import { Injectable, inject } from '@angular/core';

import { countryNameEn } from '../data/countries';
import { Coordinates, Country, Trip } from '../models';
import { UserContentStore, newId } from '../state/user-content.store';
import { UserStateStore } from '../state/user-state.store';
import { ContentService } from './content.service';
import { PhotoStorageService } from './photo-storage.service';

/** A city that does not exist yet and is created together with the trip. */
export interface NewCity {
  name: string;
  /** An existing country... */
  countryId?: string;
  /** ...or one to create/match by ISO code or name. */
  countryCode?: string;
  countryName?: string;
}

export interface TripInput {
  title: string;
  startDate: string;
  endDate: string;
  cityIds: string[];
  newCities: NewCity[];
}

export interface TripSaved {
  tripId: string;
  /** Lower-case city name -> city id, for every city in the trip. */
  cityIdByName: Record<string, string>;
}

const GEOCODE_TIMEOUT_MS = 6000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Creating, changing and deleting trips (with the cities they need and everything that belongs to them). */
@Injectable({ providedIn: 'root' })
export class TripService {
  private readonly content = inject(ContentService);
  private readonly store = inject(UserContentStore);
  private readonly userState = inject(UserStateStore);
  private readonly files = inject(PhotoStorageService);

  async save(input: TripInput, id?: string): Promise<TripSaved> {
    const cityIds = [...input.cityIds];
    const created = new Map<string, string>(); // country key -> id, so two new cities share one new country
    let geocoded = 0;

    for (const nc of input.newCities) {
      const countryId = this.resolveCountry(nc, created);
      const existing = this.content.getCitiesByCountry(countryId).find(c => c.name.toLowerCase() === nc.name.trim().toLowerCase());
      if (existing) {
        if (!cityIds.includes(existing.id)) cityIds.push(existing.id);
        continue;
      }

      // one request per second is the Nominatim usage policy
      if (geocoded++) await sleep(1100);
      const coordinates = await this.geocode(nc.name, this.content.getCountry(countryId)?.name ?? nc.countryName ?? countryNameEn(nc.countryCode ?? ''));
      const sibling = this.content.getCitiesByCountry(countryId)[0];
      const cityId = newId('city');
      this.store.upsert('cities', {
        id: cityId,
        countryId,
        name: nc.name.trim(),
        timezone: sibling?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(coordinates ? { coordinates } : {}),
      });
      cityIds.push(cityId);
    }

    const trip: Trip = {
      ...(id ? this.content.getTrip(id) : undefined),
      id: id ?? newId('trip'),
      title: input.title.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      cityIds,
    };
    this.store.upsert('trips', trip);

    const cityIdByName: Record<string, string> = {};
    for (const cityId of cityIds) {
      const city = this.content.getCity(cityId);
      if (city) cityIdByName[city.name.toLowerCase()] = cityId;
    }
    return { tripId: trip.id, cityIdByName };
  }

  /** What deleting the trip would remove, to show before the user confirms. */
  summary(tripId: string): { bookings: number; assignments: number } {
    return {
      bookings: this.content.getBookings(tripId).length,
      assignments: this.userState.assignedRoutes().filter(a => a.tripId === tripId && !a.deleted).length,
    };
  }

  /** Deletes the trip with its bookings (and their stored documents) and its route assignments. */
  async remove(tripId: string): Promise<void> {
    const bookings = this.content.getBookings(tripId);
    const others = new Set(
      Object.values(this.store.content().bookings)
        .flatMap(r => (r.value && r.value.tripId !== tripId ? r.value.attachments ?? [] : []))
        .map(a => a.id),
    );

    for (const b of bookings) {
      this.store.remove('bookings', b.id);
      for (const a of b.attachments ?? []) {
        if (!others.has(a.id)) await this.files.delete(a.id);
      }
    }
    for (const a of this.userState.assignedRoutes().filter(x => x.tripId === tripId && !x.deleted)) {
      this.userState.unassignRoute(tripId, a.routeId, a.date);
    }
    this.store.remove('trips', tripId);
  }

  private resolveCountry(nc: NewCity, created: Map<string, string>): string {
    if (nc.countryId) return nc.countryId;

    const key = (nc.countryCode ?? nc.countryName ?? '').toLowerCase();
    const known = created.get(key);
    if (known) return known;

    const existing = this.content.getCountries().find(
      c => (nc.countryCode && c.code === nc.countryCode) || (nc.countryName && c.name.toLowerCase() === nc.countryName.toLowerCase()),
    );
    if (existing) return existing.id;

    const country: Country = {
      id: newId('country'),
      name: nc.countryName?.trim() || countryNameEn(nc.countryCode ?? '') || 'Country',
      ...(nc.countryCode ? { code: nc.countryCode } : {}),
    };
    this.store.upsert('countries', country);
    created.set(key, country.id);
    return country.id;
  }

  /** Best effort: the position of a new city, so weather can be shown for it. Never fails the save. */
  private async geocode(name: string, country: string): Promise<Coordinates | undefined> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(`${name}, ${country}`)}`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return undefined;
      const [hit] = (await response.json()) as { lat: string; lon: string }[];
      const lat = Number(hit?.lat);
      const lng = Number(hit?.lon);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}
