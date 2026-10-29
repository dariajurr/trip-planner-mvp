import { Injectable, computed, inject, signal } from '@angular/core';

import { ContentService } from '../services/content.service';
import { LocalStorageService } from '../services/local-storage.service';
import { todayIso } from '../utils/dates';
import { pickDefaultTrip } from '../utils/trip-utils';
import { UserStateStore } from './user-state.store';
import { Trip, TripDay } from '../models';

const SELECTED_KEY = 'trip-app.selected-trip';

@Injectable({
  providedIn: 'root',
})
export class TripStateStore {
  private readonly content = inject(ContentService);
  private readonly userState = inject(UserStateStore);
  private readonly storage = inject(LocalStorageService);

  /** Device date, used to pick the default trip. */
  readonly today = todayIso();

  private readonly _selectedTripId = signal<string | null>(this.storage.get<string>(SELECTED_KEY));
  private readonly _selectedDate = signal<string | null>(null);
  private readonly _selectedRouteId = signal<string | null>(null);

  readonly selectedTripId = computed(() => this.trip()?.id ?? null);
  readonly selectedRouteId = this._selectedRouteId.asReadonly();

  readonly trips = computed(() => this.content.getTrips());

  /** The chosen trip; if none was chosen (or it was deleted): the one in progress, the next one, or the latest. */
  readonly trip = computed<Trip | undefined>(() => {
    const id = this._selectedTripId();
    return (id ? this.content.getTrip(id) : undefined) ?? pickDefaultTrip(this.trips(), this.today);
  });

  /** The chosen day if it lies inside the trip, otherwise today (during the trip) or the first day. */
  readonly selectedDate = computed<string | null>(() => {
    const trip = this.trip();
    if (!trip) return null;
    const chosen = this._selectedDate();
    if (chosen && chosen >= trip.startDate && chosen <= trip.endDate) return chosen;
    return this.today >= trip.startDate && this.today <= trip.endDate ? this.today : trip.startDate;
  });

  readonly cities = computed(() => {
    const trip = this.trip();
    return trip ? this.content.getTripCities(trip.id) : [];
  });

  readonly countries = computed(() => {
    const trip = this.trip();
    return trip ? this.content.getTripCountries(trip.id) : [];
  });

  readonly selectedDay = computed<TripDay | undefined>(() => {
    const trip = this.trip();
    const date = this.selectedDate();
    if (!trip || !date) return undefined;

    return {
      tripId: trip.id,
      date,
      assignedRouteIds: this.userState.getAssignedRouteIds(trip.id, date),
    };
  });

  readonly selectedRoute = computed(() => {
    const routeId = this._selectedRouteId();
    return routeId ? this.content.getRoute(routeId) : undefined;
  });

  selectTrip(tripId: string): void {
    if (!this.content.getTrip(tripId)) {
      return;
    }
    this._selectedTripId.set(tripId);
    this.storage.set(SELECTED_KEY, tripId);
    this._selectedDate.set(null);
    this._selectedRouteId.set(null);
  }

  selectDate(date: string): void {
    this._selectedDate.set(date);
  }

  selectRoute(routeId: string | null): void {
    if (routeId && !this.content.getRoute(routeId)) {
      return;
    }
    this._selectedRouteId.set(routeId);
  }

  reset(): void {
    this._selectedDate.set(null);
    this._selectedRouteId.set(null);
  }
}
