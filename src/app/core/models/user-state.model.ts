export type PlaceUserStatus = 'want' | 'visited' | 'not-wanted';

/** Personal marks. Synced between devices only when the importer opts in. */
export interface UserPlaceState {
  placeId: string;
  /** null = neutral (kept as a record so that "cleared" can also be synced). */
  status: PlaceUserStatus | null;
  isFavorite: boolean;
  updatedAt: string;
}

/** Shared plan data. `deleted` is a tombstone so removals sync too. */
export interface AssignedRoute {
  tripId: string;
  routeId: string;
  date: string;
  updatedAt: string;
  deleted?: boolean;
}

export type PhotoStatus = 'want' | 'done' | 'retake';

export interface UserPhotoSpotState {
  photoSpotId: string;
  status: PhotoStatus;
  photoIds: string[];
  note?: string;
  updatedAt: string;
}

export interface UserPhoto {
  id: string;
  photoSpotId: string;
  createdAt: string;
  isFavorite?: boolean;
  note?: string;
}

export interface UserNote {
  text: string;
  updatedAt: string;
}

export interface UserState {
  version: 3;
  placeStates: UserPlaceState[];
  assignedRoutes: AssignedRoute[];
  photoSpots: UserPhotoSpotState[];
  /** Notes by entity id (place, route, day...). Part of the shared plan. */
  notes: Record<string, UserNote>;
}
