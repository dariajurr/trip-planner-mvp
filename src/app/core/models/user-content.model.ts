import { Area } from './area.model';
import { Booking } from './booking.model';
import { City } from './city.model';
import { Country } from './country.model';
import { PhotoSpot } from './photo-spot.model';
import { Place } from './place.model';
import { Route } from './route.model';
import { Trip } from './trip.model';

/**
 * A user's change on top of the built-in catalog, keyed by entity id.
 * value === null is a tombstone (the entity was deleted), kept so that deletions sync.
 * A record whose id exists in the catalog overrides that catalog entity.
 */
export interface OverlayRecord<T> {
  value: T | null;
  updatedAt: string;
}

export type OverlayMap<T> = Record<string, OverlayRecord<T>>;

export interface UserContent {
  version: 1;
  countries: OverlayMap<Country>;
  cities: OverlayMap<City>;
  areas: OverlayMap<Area>;
  places: OverlayMap<Place>;
  routes: OverlayMap<Route>;
  photoSpots: OverlayMap<PhotoSpot>;
  trips: OverlayMap<Trip>;
  bookings: OverlayMap<Booking>;
}

export type ContentCollection = Exclude<keyof UserContent, 'version'>;

export const CONTENT_COLLECTIONS: ContentCollection[] = [
  'countries',
  'cities',
  'areas',
  'places',
  'routes',
  'photoSpots',
  'trips',
  'bookings',
];

export function emptyUserContent(): UserContent {
  return {
    version: 1,
    countries: {},
    cities: {},
    areas: {},
    places: {},
    routes: {},
    photoSpots: {},
    trips: {},
    bookings: {},
  };
}
