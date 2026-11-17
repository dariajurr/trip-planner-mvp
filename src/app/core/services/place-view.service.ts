import { Injectable, inject } from '@angular/core';

import { Place, PlacePhoto, PlaceUserStatus } from '../models';
import { UserStateStore } from '../state/user-state.store';
import { CATEGORY_LABELS, formatDuration } from '../../features/places/place-labels';
import { ContentService } from './content.service';

/** Everything a place card shows, ready to display. */
export interface PlaceVm {
  place: Place;
  icon: string;
  categoryLabel: string;
  areaName: string;
  cityName: string;
  duration: string | null;
  hours: string | null;
  mapsUrl: string;
  photos: PlacePhoto[];
  description: string | null;
  descriptionCredit: { label: string; url?: string } | null;
  address: string | null;
  website: string | null;
  sources: string | null;
  custom: boolean;
  status: PlaceUserStatus | null;
  favorite: boolean;
}

/** Builds place view models. Reads signals, so computed values using it stay up to date. */
@Injectable({ providedIn: 'root' })
export class PlaceViewService {
  private readonly content = inject(ContentService);
  private readonly userState = inject(UserStateStore);

  vm(place: Place): PlaceVm {
    const area = this.content.getArea(place.areaId);
    const city = area ? this.content.getCity(area.cityId) : undefined;
    const state = this.userState.getPlaceState(place.id);
    const hours = place.schedule.openingHours;
    const category = CATEGORY_LABELS[place.category];

    return {
      place,
      icon: category.icon,
      categoryLabel: category.label,
      areaName: area?.name ?? '',
      cityName: city?.name ?? '',
      duration: formatDuration(place.recommendedDurationMin),
      hours: hours ? `${hours.from}–${hours.to}` : (place.schedule.hoursText ?? null),
      mapsUrl: place.googleMapsUrl ?? mapsSearchUrl(place),
      photos: place.photos ?? [],
      description: place.description ?? null,
      descriptionCredit: place.descriptionCredit ?? null,
      address: place.address ?? null,
      website: place.website ?? null,
      sources: place.sources?.length ? place.sources.join(' · ') : null,
      custom: place.id.startsWith('u-'),
      status: state?.status ?? null,
      favorite: state?.isFavorite ?? false,
    };
  }
}

export const mapsSearchUrl = (place: Pick<Place, 'coordinates'>) =>
  `https://www.google.com/maps/search/?api=1&query=${place.coordinates.lat},${place.coordinates.lng}`;

/** Directions to the place, from the given point or (when none) from where the user is. */
export function routeUrl(to: { lat: number; lng: number }, from?: { lat: number; lng: number } | null, mode: 'transit' | 'walking' = 'transit'): string {
  const params = new URLSearchParams({ api: '1', destination: `${to.lat},${to.lng}`, travelmode: mode });
  if (from) params.set('origin', `${from.lat},${from.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
