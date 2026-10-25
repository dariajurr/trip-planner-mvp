import { Injectable, inject } from '@angular/core';

import { Route, RouteTag } from '../models';
import { UserContentStore, newId } from '../state/user-content.store';
import { addStops, moveStop, removeStop, reorderNearest, StopPatch, updateStop } from '../utils/route-utils';
import { ContentService } from './content.service';

export interface RouteMeta {
  title: string;
  icon: string;
  description: string;
  tags: RouteTag[];
  weatherDependent: boolean;
}

/** Changes to routes. Everything goes to the user overlay, the catalog is never touched. */
@Injectable({ providedIn: 'root' })
export class RouteEditService {
  private readonly content = inject(ContentService);
  private readonly store = inject(UserContentStore);

  create(meta: RouteMeta): string {
    const route: Route = { id: newId('route'), stops: [], ...this.metaFields(meta) } as Route;
    this.store.upsert('routes', route);
    return route.id;
  }

  updateMeta(id: string, meta: RouteMeta): void {
    this.edit(id, route => {
      const next: Route = { ...route, title: meta.title.trim(), tags: meta.tags };
      this.setOrDelete(next, 'icon', meta.icon.trim());
      this.setOrDelete(next, 'description', meta.description.trim());
      this.setOrDelete(next, 'weatherDependent', meta.weatherDependent || undefined);
      return next;
    });
  }

  addPlaces(id: string, placeIds: string[]): void {
    const places = placeIds.map(p => this.content.getPlace(p)).filter((p): p is NonNullable<typeof p> => !!p);
    this.edit(id, route => addStops(route, places));
  }

  removeStop(id: string, index: number): void {
    this.edit(id, route => removeStop(route, index));
  }

  moveStop(id: string, index: number, delta: -1 | 1): void {
    this.edit(id, route => moveStop(route, index, delta));
  }

  updateStop(id: string, index: number, patch: StopPatch): void {
    this.edit(id, route => updateStop(route, index, patch));
  }

  reorderNearest(id: string): void {
    this.edit(id, route => reorderNearest(route, placeId => this.content.getPlace(placeId)?.coordinates));
  }

  duplicate(id: string): string | null {
    const route = this.content.getRoute(id);
    if (!route) return null;
    const copy: Route = { ...route, id: newId('route'), title: `${route.title} (копия)` };
    this.store.upsert('routes', copy);
    return copy.id;
  }

  remove(id: string): void {
    this.store.remove('routes', id);
  }

  /** A catalog route that the user has changed. */
  isOverridden(id: string): boolean {
    return !id.startsWith('u-') && !!this.store.content().routes[id]?.value;
  }

  resetToCatalog(id: string): void {
    this.store.resetToCatalog('routes', id);
  }

  private edit(id: string, fn: (route: Route) => Route): void {
    const route = this.content.getRoute(id);
    if (route) {
      this.store.upsert('routes', fn(route));
    }
  }

  private metaFields(meta: RouteMeta): Partial<Route> {
    const fields: Partial<Route> = { title: meta.title.trim(), tags: meta.tags };
    if (meta.icon.trim()) fields.icon = meta.icon.trim();
    if (meta.description.trim()) fields.description = meta.description.trim();
    if (meta.weatherDependent) fields.weatherDependent = true;
    return fields;
  }

  private setOrDelete<K extends keyof Route>(route: Route, key: K, value: Route[K] | '' | undefined): void {
    if (value === undefined || value === '') delete route[key];
    else route[key] = value as Route[K];
  }
}
