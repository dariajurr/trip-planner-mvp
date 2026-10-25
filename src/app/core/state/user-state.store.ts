import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { LocalStorageService } from '../services/local-storage.service';
import {
  AssignedRoute,
  PhotoStatus,
  PlaceUserStatus,
  UserNote,
  UserPhotoSpotState,
  UserPlaceState,
  UserState,
} from '../models/user-state.model';

const STORAGE_KEY = 'trip-app.user-state.v3';
const V2_STORAGE_KEY = 'trip-app.user-state.v2';
/** Pre-v2 key: assignments had no tripId and all belonged to the Japan trip. */
const LEGACY_STORAGE_KEY = 'japan-trip-user-state';
const LEGACY_TRIP_ID = 'japan-2026';

/** Migrated records get the epoch, so any real edit made later wins on merge. */
const EPOCH = '1970-01-01T00:00:00.000Z';

const now = () => new Date().toISOString();

/** Accepts v1/v2/v3 shapes and returns a valid v3 state. */
export function normalizeUserState(raw: unknown, fallbackTripId = LEGACY_TRIP_ID): UserState {
  const r = (raw ?? {}) as Record<string, any>;

  const notes: Record<string, UserNote> = {};
  for (const [id, value] of Object.entries<any>(r['notes'] ?? {})) {
    notes[id] =
      typeof value === 'string'
        ? { text: value, updatedAt: EPOCH }
        : { text: String(value?.text ?? ''), updatedAt: value?.updatedAt ?? EPOCH };
  }

  return {
    version: 3,
    placeStates: (r['placeStates'] ?? []).map((s: any) => ({
      placeId: s.placeId,
      status: s.status ?? null,
      isFavorite: !!s.isFavorite,
      updatedAt: s.updatedAt ?? EPOCH,
    })),
    assignedRoutes: (r['assignedRoutes'] ?? []).map((a: any) => ({
      tripId: a.tripId ?? fallbackTripId,
      routeId: a.routeId,
      date: a.date,
      updatedAt: a.updatedAt ?? EPOCH,
      ...(a.deleted ? { deleted: true } : {}),
    })),
    photoSpots: (r['photoSpots'] ?? []).map((s: any) => ({
      photoSpotId: s.photoSpotId,
      status: s.status,
      photoIds: s.photoIds ?? [],
      ...(s.note ? { note: s.note } : {}),
      updatedAt: s.updatedAt ?? EPOCH,
    })),
    notes,
  };
}

@Injectable({ providedIn: 'root' })
export class UserStateStore {
  private readonly storage = inject(LocalStorageService);

  private readonly _placeStates = signal<UserPlaceState[]>([]);
  private readonly _assignedRoutes = signal<AssignedRoute[]>([]);
  private readonly _photoSpots = signal<UserPhotoSpotState[]>([]);
  private readonly _notes = signal<Record<string, UserNote>>({});

  readonly placeStates = this._placeStates.asReadonly();
  /** Includes tombstones; use getAssignedRouteIds for the live view. */
  readonly assignedRoutes = this._assignedRoutes.asReadonly();
  readonly photoSpots = this._photoSpots.asReadonly();
  readonly notes = this._notes.asReadonly();

  readonly visitedPlaceIds = computed(() =>
    this._placeStates().filter(s => s.status === 'visited').map(s => s.placeId),
  );
  readonly favoritePlaceIds = computed(() =>
    this._placeStates().filter(s => s.isFavorite).map(s => s.placeId),
  );
  readonly notWantedPlaceIds = computed(() =>
    this._placeStates().filter(s => s.status === 'not-wanted').map(s => s.placeId),
  );

  constructor() {
    this.restore();

    effect(() => {
      this.storage.set(STORAGE_KEY, this.snapshot());
    });
  }

  // ---- place marks -------------------------------------------------------
  getPlaceState(placeId: string): UserPlaceState | undefined {
    return this._placeStates().find(s => s.placeId === placeId);
  }

  setPlaceStatus(placeId: string, status: PlaceUserStatus | null): void {
    this.patchPlaceState(placeId, { status }, { isFavorite: false });
  }

  /** Back to neutral. The favourite flag is kept. */
  clearPlaceStatus(placeId: string): void {
    if (this.getPlaceState(placeId)) {
      this.setPlaceStatus(placeId, null);
    }
  }

  markPlaceVisited(placeId: string): void {
    this.setPlaceStatus(placeId, 'visited');
  }

  toggleFavorite(placeId: string): void {
    const current = this.getPlaceState(placeId);
    if (current) {
      this.patchPlaceState(placeId, { isFavorite: !current.isFavorite }, {});
    } else {
      this.patchPlaceState(placeId, { isFavorite: true, status: 'want' }, {});
    }
  }

  private patchPlaceState(
    placeId: string,
    patch: Partial<UserPlaceState>,
    defaults: Partial<UserPlaceState>,
  ): void {
    const updatedAt = now();
    const exists = this.getPlaceState(placeId);

    if (exists) {
      this._placeStates.update(list =>
        list.map(s => (s.placeId === placeId ? { ...s, ...patch, updatedAt } : s)),
      );
      return;
    }

    this._placeStates.update(list => [
      ...list,
      { placeId, status: null, isFavorite: false, ...defaults, ...patch, updatedAt },
    ]);
  }

  // ---- route assignments (shared plan) ----------------------------------
  assignRoute(tripId: string, routeId: string, date: string): void {
    const updatedAt = now();
    const same = (a: AssignedRoute) => a.tripId === tripId && a.routeId === routeId && a.date === date;

    if (this._assignedRoutes().some(same)) {
      this._assignedRoutes.update(list =>
        list.map(a => (same(a) ? { tripId, routeId, date, updatedAt } : a)),
      );
      return;
    }
    this._assignedRoutes.update(list => [...list, { tripId, routeId, date, updatedAt }]);
  }

  unassignRoute(tripId: string, routeId: string, date: string): void {
    const updatedAt = now();
    this._assignedRoutes.update(list =>
      list.map(a =>
        a.tripId === tripId && a.routeId === routeId && a.date === date
          ? { ...a, deleted: true, updatedAt }
          : a,
      ),
    );
  }

  getAssignedRouteIds(tripId: string, date: string): string[] {
    return this._assignedRoutes()
      .filter(a => a.tripId === tripId && a.date === date && !a.deleted)
      .map(a => a.routeId);
  }

  isRouteAssigned(tripId: string, routeId: string, date: string): boolean {
    return this._assignedRoutes().some(
      a => a.tripId === tripId && a.routeId === routeId && a.date === date && !a.deleted,
    );
  }

  // ---- photo spots -------------------------------------------------------
  getPhotoSpotState(photoSpotId: string): UserPhotoSpotState | undefined {
    return this._photoSpots().find(s => s.photoSpotId === photoSpotId);
  }

  setPhotoStatus(photoSpotId: string, status: PhotoStatus): void {
    const updatedAt = now();
    if (this.getPhotoSpotState(photoSpotId)) {
      this._photoSpots.update(list =>
        list.map(s => (s.photoSpotId === photoSpotId ? { ...s, status, updatedAt } : s)),
      );
      return;
    }
    this._photoSpots.update(list => [...list, { photoSpotId, status, photoIds: [], updatedAt }]);
  }

  // ---- notes -------------------------------------------------------------
  setNote(id: string, text: string): void {
    this._notes.update(notes => ({ ...notes, [id]: { text, updatedAt: now() } }));
  }

  // ---- queries -----------------------------------------------------------
  isVisited(placeId: string): boolean {
    return this.getPlaceState(placeId)?.status === 'visited';
  }

  isNotWanted(placeId: string): boolean {
    return this.getPlaceState(placeId)?.status === 'not-wanted';
  }

  isFavorite(placeId: string): boolean {
    return !!this.getPlaceState(placeId)?.isFavorite;
  }

  // ---- sync --------------------------------------------------------------
  snapshot(): UserState {
    return {
      version: 3,
      placeStates: this._placeStates(),
      assignedRoutes: this._assignedRoutes(),
      photoSpots: this._photoSpots(),
      notes: this._notes(),
    };
  }

  /** Replaces the given parts; used by import after merging. */
  replace(parts: Partial<Omit<UserState, 'version'>>): void {
    if (parts.placeStates) this._placeStates.set(parts.placeStates);
    if (parts.photoSpots) this._photoSpots.set(parts.photoSpots);
    if (parts.assignedRoutes) this._assignedRoutes.set(parts.assignedRoutes);
    if (parts.notes) this._notes.set(parts.notes);
  }

  private restore(): void {
    const raw =
      this.storage.get<unknown>(STORAGE_KEY) ??
      this.storage.get<unknown>(V2_STORAGE_KEY) ??
      this.storage.get<unknown>(LEGACY_STORAGE_KEY);

    const state = normalizeUserState(raw);
    this._placeStates.set(state.placeStates);
    this._assignedRoutes.set(state.assignedRoutes);
    this._photoSpots.set(state.photoSpots);
    this._notes.set(state.notes);
  }
}
