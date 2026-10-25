import { Injectable, computed, inject, signal } from '@angular/core';

import { ContentService } from '../services/content.service';
import { UserStateStore } from './user-state.store';
import { Trip, TripDay } from '../models';

@Injectable({
  providedIn: 'root',
})
export class TripStateStore {
  private readonly content = inject(ContentService);
  private readonly userState = inject(UserStateStore);

  private readonly _selectedTripId = signal<string | null>(null);
  private readonly _selectedDate = signal<string | null>(null);
  private readonly _selectedRouteId = signal<string | null>(null);

  readonly selectedTripId = this._selectedTripId.asReadonly();
  readonly selectedDate = this._selectedDate.asReadonly();
  readonly selectedRouteId = this._selectedRouteId.asReadonly();

  readonly trips = computed(() => this.content.getTrips());

  readonly trip = computed<Trip | undefined>(() => {
    const id = this._selectedTripId();
    return id ? this.content.getTrip(id) : undefined;
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
    const date = this._selectedDate();

    if (!trip || !date || date < trip.startDate || date > trip.endDate) {
      return undefined;
    }

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

  constructor() {
    const first = this.content.getTrips()[0];
    if (first) {
      this.selectTrip(first.id);
    }
  }

  selectTrip(tripId: string): void {
    const trip = this.content.getTrip(tripId);
    if (!trip) {
      return;
    }

    this._selectedTripId.set(trip.id);
    this._selectedDate.set(trip.startDate);
    this._selectedRouteId.set(null);
  }

  selectDate(date: string): void {
    const trip = this.trip();
    if (!trip || date < trip.startDate || date > trip.endDate) {
      return;
    }

    this._selectedDate.set(date);
  }

  selectRoute(routeId: string | null): void {
    if (routeId && !this.content.getRoute(routeId)) {
      return;
    }

    this._selectedRouteId.set(routeId);
  }

  reset(): void {
    const trip = this.trip();
    this._selectedDate.set(trip ? trip.startDate : null);
    this._selectedRouteId.set(null);
  }
}
