import { Injectable, effect, inject, signal } from '@angular/core';

import {
  CONTENT_COLLECTIONS,
  ContentCollection,
  OverlayMap,
  UserContent,
  emptyUserContent,
} from '../models';
import { LocalStorageService } from '../services/local-storage.service';

const STORAGE_KEY = 'trip-app.user-content.v1';

type EntityOf<K extends ContentCollection> = NonNullable<UserContent[K][string]['value']>;

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `u-${prefix}-${Date.now().toString(36)}${rand}`;
}

/** Everything the user created or changed on top of the built-in catalog. */
@Injectable({ providedIn: 'root' })
export class UserContentStore {
  private readonly storage = inject(LocalStorageService);

  private readonly _content = signal<UserContent>(this.load());
  readonly content = this._content.asReadonly();

  constructor() {
    effect(() => this.storage.set(STORAGE_KEY, this._content()));
  }

  /** Creates or overrides an entity. */
  upsert<K extends ContentCollection>(collection: K, value: EntityOf<K> & { id: string }): void {
    this.setRecord(collection, value.id, { value, updatedAt: new Date().toISOString() } as never);
  }

  /** Writes a tombstone: removes a user entity or hides a catalog one. */
  remove(collection: ContentCollection, id: string): void {
    this.setRecord(collection, id, { value: null, updatedAt: new Date().toISOString() } as never);
  }

  /** Drops the override entirely, so the catalog version shows again. */
  resetToCatalog(collection: ContentCollection, id: string): void {
    this._content.update(c => {
      const map = { ...(c[collection] as OverlayMap<unknown>) };
      delete map[id];
      return { ...c, [collection]: map };
    });
  }

  replace(content: UserContent): void {
    this._content.set(content);
  }

  snapshot(): UserContent {
    return this._content();
  }

  private setRecord(collection: ContentCollection, id: string, record: unknown): void {
    this._content.update(c => ({
      ...c,
      [collection]: { ...(c[collection] as OverlayMap<unknown>), [id]: record },
    }));
  }

  private load(): UserContent {
    const raw = this.storage.get<Partial<UserContent>>(STORAGE_KEY);
    const content = emptyUserContent();
    if (raw) {
      for (const key of CONTENT_COLLECTIONS) {
        if (raw[key]) {
          (content[key] as OverlayMap<unknown>) = raw[key] as OverlayMap<unknown>;
        }
      }
    }
    return content;
  }
}
