import { Coordinates } from './coordinates.model';
import { PlacePhoto } from './photo.model';
import { PlaceSchedule } from './schedule.model';

export type PlacePriority = 'must' | 'optional';

export type PlaceCategory =
  | 'temple'
  | 'shrine'
  | 'landmark'
  | 'viewpoint'
  | 'shopping'
  | 'market'
  | 'street'
  | 'park'
  | 'museum'
  | 'district'
  | 'beach'
  | 'restaurant'
  | 'event'
  | 'other';

/** City is derived through areaId -> Area.cityId, it is not stored on the place. */
export interface Place {
  id: string;
  name: string;
  nameLocal?: string;
  category: PlaceCategory;
  priority: PlacePriority;
  areaId: string;
  description?: string;
  coordinates: Coordinates;
  schedule: PlaceSchedule;
  recommendedDurationMin?: number;
  address?: string;
  googleMapsUrl?: string;
  website?: string;
  tags?: string[];
  /** First photo is shown on the card. */
  photos?: PlacePhoto[];
  /** Attribution for data taken from open sources, e.g. "© OpenStreetMap contributors". */
  sources?: string[];
}
