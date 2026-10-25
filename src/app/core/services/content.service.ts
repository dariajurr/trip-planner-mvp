import { Injectable, computed, inject } from '@angular/core';

import { Area, Booking, City, Coordinates, Country, OverlayMap, PhotoSpot, Place, Route, Trip } from '../models';
import { UserContentStore } from '../state/user-content.store';
import { haversineKm } from '../utils/geo';

import countriesData from '../../../assets/data/catalog/countries.json';
import citiesData from '../../../assets/data/catalog/cities.json';
import areasData from '../../../assets/data/catalog/areas.json';
import placesData from '../../../assets/data/catalog/places.json';
import routesData from '../../../assets/data/catalog/routes.json';
import photoSpotsData from '../../../assets/data/catalog/photo-spots.json';
import japan2026 from '../../../assets/data/trips/japan-2026.json';

/** Catalog entities with the user's overlay applied (overrides, additions, deletions). */
function applyOverlay<T extends { id: string }>(base: T[], overlay: OverlayMap<T>): T[] {
  const out: T[] = [];
  const seen = new Set<string>();

  for (const item of base) {
    seen.add(item.id);
    const record = overlay[item.id];
    if (!record) {
      out.push(item);
    } else if (record.value) {
      out.push(record.value);
    }
  }
  for (const [id, record] of Object.entries(overlay)) {
    if (!seen.has(id) && record.value) {
      out.push(record.value);
    }
  }
  return out;
}

/**
 * Country -> City -> Area -> Place / PhotoSpot, plus reusable Routes.
 * Built from the read-only catalog and the user's overlay, so everything is reactive:
 * computed signals that call these methods update when the user adds or edits content.
 */
@Injectable({ providedIn: 'root' })
export class ContentService {
  private readonly overlay = inject(UserContentStore).content;

  private readonly tripsSig = computed(() => applyOverlay([japan2026] as Trip[], this.overlay().trips));
  private readonly countriesSig = computed(() => applyOverlay(countriesData as Country[], this.overlay().countries));
  private readonly citiesSig = computed(() => applyOverlay(citiesData as City[], this.overlay().cities));
  private readonly areasSig = computed(() => applyOverlay(areasData as Area[], this.overlay().areas));
  private readonly placesSig = computed(() => applyOverlay(placesData as Place[], this.overlay().places));
  private readonly routesSig = computed(() => applyOverlay(routesData as Route[], this.overlay().routes));
  private readonly photoSpotsSig = computed(() => applyOverlay(photoSpotsData as PhotoSpot[], this.overlay().photoSpots));

  private readonly bookingsSig = computed(() => applyOverlay<Booking>([], this.overlay().bookings));

  private readonly areaByIdSig = computed(() => new Map(this.areasSig().map(a => [a.id, a])));
  private readonly placeByIdSig = computed(() => new Map(this.placesSig().map(p => [p.id, p])));

  private get trips(): Trip[] { return this.tripsSig(); }
  private get countries(): Country[] { return this.countriesSig(); }
  private get cities(): City[] { return this.citiesSig(); }
  private get areas(): Area[] { return this.areasSig(); }
  private get places(): Place[] { return this.placesSig(); }
  private get routes(): Route[] { return this.routesSig(); }
  private get photoSpots(): PhotoSpot[] { return this.photoSpotsSig(); }
  private get areaById(): Map<string, Area> { return this.areaByIdSig(); }
  private get placeById(): Map<string, Place> { return this.placeByIdSig(); }

  // ---- trips -------------------------------------------------------------
  getTrips(): Trip[] {
    return this.trips;
  }

  getTrip(id: string): Trip | undefined {
    return this.trips.find(t => t.id === id);
  }

  getTripCities(tripId: string): City[] {
    const trip = this.getTrip(tripId);
    return trip ? trip.cityIds.map(id => this.getCity(id)).filter((c): c is City => !!c) : [];
  }

  getTripCountries(tripId: string): Country[] {
    const ids = new Set(this.getTripCities(tripId).map(c => c.countryId));
    return this.countries.filter(c => ids.has(c.id));
  }

  // ---- bookings ----------------------------------------------------------
  getBookings(tripId: string): Booking[] {
    return this.bookingsSig().filter(b => b.tripId === tripId);
  }

  getBooking(id: string): Booking | undefined {
    return this.bookingsSig().find(b => b.id === id);
  }

  // ---- geography ---------------------------------------------------------
  getCountries(): Country[] {
    return this.countries;
  }

  getCountry(id: string): Country | undefined {
    return this.countries.find(c => c.id === id);
  }

  getCities(): City[] {
    return this.cities;
  }

  getCity(id: string): City | undefined {
    return this.cities.find(c => c.id === id);
  }

  getCitiesByCountry(countryId: string): City[] {
    return this.cities.filter(c => c.countryId === countryId);
  }

  getAreas(): Area[] {
    return this.areas;
  }

  getArea(id: string): Area | undefined {
    return this.areaById.get(id);
  }

  getAreasByCity(cityId: string): Area[] {
    return this.areas.filter(a => a.cityId === cityId);
  }

  // ---- places ------------------------------------------------------------
  getPlaces(): Place[] {
    return this.places;
  }

  getPlace(id: string): Place | undefined {
    return this.placeById.get(id);
  }

  getPlacesByArea(areaId: string): Place[] {
    return this.places.filter(p => p.areaId === areaId);
  }

  getPlacesByCity(cityId: string): Place[] {
    return this.places.filter(p => this.getCityIdForPlace(p.id) === cityId);
  }

  /** The city's own coordinates, or the centre of its places when the city has none (user-created cities). */
  getCityCoordinates(cityId: string): Coordinates | undefined {
    const city = this.getCity(cityId);
    if (city?.coordinates) {
      return city.coordinates;
    }
    const places = this.getPlacesByCity(cityId);
    if (!places.length) {
      return undefined;
    }
    return {
      lat: places.reduce((s, p) => s + p.coordinates.lat, 0) / places.length,
      lng: places.reduce((s, p) => s + p.coordinates.lng, 0) / places.length,
    };
  }

  getCityIdForArea(areaId: string): string | undefined {
    return this.areaById.get(areaId)?.cityId;
  }

  getCityIdForPlace(placeId: string): string | undefined {
    const place = this.placeById.get(placeId);
    return place ? this.getCityIdForArea(place.areaId) : undefined;
  }

  // ---- photo spots -------------------------------------------------------
  getPhotoSpots(): PhotoSpot[] {
    return this.photoSpots;
  }

  getPhotoSpot(id: string): PhotoSpot | undefined {
    return this.photoSpots.find(s => s.id === id);
  }

  getPhotoSpotsByArea(areaId: string): PhotoSpot[] {
    return this.photoSpots.filter(s => s.areaId === areaId);
  }

  getPhotoSpotsByCity(cityId: string): PhotoSpot[] {
    return this.photoSpots.filter(s => this.getCityIdForArea(s.areaId) === cityId);
  }

  // ---- routes ------------------------------------------------------------
  getRoutes(): Route[] {
    return this.routes;
  }

  getRoute(id: string): Route | undefined {
    return this.routes.find(r => r.id === id);
  }

  /** Cities touched by the route, derived from its stops (order of first appearance). */
  getRouteCityIds(route: Route): string[] {
    const ids: string[] = [];
    for (const stop of route.stops) {
      const cityId = this.getCityIdForPlace(stop.placeId);
      if (cityId && !ids.includes(cityId)) {
        ids.push(cityId);
      }
    }
    return ids;
  }

  getRoutesByCity(cityId: string): Route[] {
    return this.routes.filter(r => this.getRouteCityIds(r).includes(cityId));
  }

  /** Routes that stay within the cities of the trip. */
  getRoutesForTrip(tripId: string): Route[] {
    const trip = this.getTrip(tripId);
    if (!trip) {
      return [];
    }
    return this.routes.filter(r =>
      this.getRouteCityIds(r).every(cityId => trip.cityIds.includes(cityId)),
    );
  }

  /**
   * The existing area whose places are closest to the point (within maxKm), or undefined.
   * Used to pre-select city and area when a new place is added by coordinates.
   */
  suggestArea(lat: number, lng: number, maxKm = 4): Area | undefined {
    const sums = new Map<string, { lat: number; lng: number; n: number }>();
    for (const place of this.places) {
      const s = sums.get(place.areaId) ?? { lat: 0, lng: 0, n: 0 };
      s.lat += place.coordinates.lat;
      s.lng += place.coordinates.lng;
      s.n++;
      sums.set(place.areaId, s);
    }

    let best: { area: Area; km: number } | undefined;
    for (const [areaId, s] of sums) {
      const area = this.areaById.get(areaId);
      if (!area) {
        continue;
      }
      const km = haversineKm(lat, lng, s.lat / s.n, s.lng / s.n);
      if (km <= maxKm && (!best || km < best.km)) {
        best = { area, km };
      }
    }
    return best?.area;
  }
}
