import { Coordinates } from './coordinates.model';

export type PhotoTime =
  | 'morning'
  | 'day'
  | 'golden-hour'
  | 'sunset'
  | 'night'
  | 'any';

export type PhotoDifficulty = 'easy' | 'medium' | 'hard';

export interface PhotoSpot {
  id: string;
  title: string;
  /** Area the spot belongs to; used to suggest spots when filtering by area. */
  areaId: string;
  description?: string;
  coordinates: Coordinates;
  /** Places this spot is shot from/next to (may be empty). */
  placeIds: string[];
  routeIds?: string[];
  referenceImages?: string[];
  shootingPosition?: string;
  cameraDirection?: string;
  bestTime?: PhotoTime;
  weatherConditions?: string;
  difficulty?: PhotoDifficulty;
  estimatedDetourMin?: number;
  googleMapsUrl?: string;
  tags?: string[];
}
