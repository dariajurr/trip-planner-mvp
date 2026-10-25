import { Coordinates, Place, Route, RouteStop, TransportOption } from '../models';
import { haversineKm } from './geo';

/** Transport belongs to the leg "this stop -> the next one". Drop it where the next stop changed. */
function reconcile(before: RouteStop[], after: RouteStop[]): RouteStop[] {
  const nextOf = (stops: RouteStop[], i: number) => stops[i + 1]?.placeId;
  const oldNext = new Map(before.map((s, i) => [s.placeId, nextOf(before, i)]));

  return after.map((stop, i) => {
    const kept = oldNext.has(stop.placeId) && oldNext.get(stop.placeId) === nextOf(after, i);
    if (kept || !stop.transportToNext) {
      return { ...stop, order: i + 1 };
    }
    const { transportToNext: _dropped, ...rest } = stop;
    return { ...rest, order: i + 1 };
  });
}

const withStops = (route: Route, stops: RouteStop[]): Route => ({ ...route, stops: reconcile(route.stops, stops) });

/** Appends places that are not in the route yet. */
export function addStops(
  route: Route,
  places: Pick<Place, 'id' | 'priority' | 'recommendedDurationMin'>[],
): Route {
  const present = new Set(route.stops.map(s => s.placeId));
  const added: RouteStop[] = [];
  for (const p of places) {
    if (present.has(p.id)) continue;
    present.add(p.id);
    added.push({
      placeId: p.id,
      order: 0,
      priority: p.priority,
      ...(p.recommendedDurationMin ? { recommendedDurationMin: p.recommendedDurationMin } : {}),
    });
  }
  return withStops(route, [...route.stops, ...added]);
}

export function removeStop(route: Route, index: number): Route {
  return withStops(route, route.stops.filter((_, i) => i !== index));
}

export function moveStop(route: Route, index: number, delta: -1 | 1): Route {
  const to = index + delta;
  if (to < 0 || to >= route.stops.length || index < 0 || index >= route.stops.length) {
    return route;
  }
  const stops = [...route.stops];
  [stops[index], stops[to]] = [stops[to], stops[index]];
  return withStops(route, stops);
}

export interface StopPatch {
  priority?: RouteStop['priority'];
  recommendedDurationMin?: number | null;
  /** null removes the transport leg. */
  transportToNext?: TransportOption | null;
}

export function updateStop(route: Route, index: number, patch: StopPatch): Route {
  const stops = route.stops.map((stop, i) => {
    if (i !== index) return stop;
    const next: RouteStop = { ...stop };
    if (patch.priority) next.priority = patch.priority;
    if (patch.recommendedDurationMin !== undefined) {
      if (patch.recommendedDurationMin && patch.recommendedDurationMin > 0) {
        next.recommendedDurationMin = Math.round(patch.recommendedDurationMin);
      } else {
        delete next.recommendedDurationMin;
      }
    }
    if (patch.transportToNext !== undefined) {
      if (patch.transportToNext) next.transportToNext = patch.transportToNext;
      else delete next.transportToNext;
    }
    return next;
  });
  return { ...route, stops: stops.map((s, i) => ({ ...s, order: i + 1 })) };
}

/**
 * Greedy nearest-neighbour order starting from the first stop (the start stays where it is).
 * A quick way to remove obvious zig-zags; not an optimal tour.
 */
export function reorderNearest(route: Route, coordsOf: (placeId: string) => Coordinates | undefined): Route {
  if (route.stops.length < 3) return route;

  const remaining = [...route.stops];
  const ordered = [remaining.shift()!];
  while (remaining.length) {
    const last = coordsOf(ordered[ordered.length - 1].placeId);
    let best = 0;
    let bestKm = Infinity;
    remaining.forEach((stop, i) => {
      const c = coordsOf(stop.placeId);
      const km = last && c ? haversineKm(last.lat, last.lng, c.lat, c.lng) : Infinity;
      if (km < bestKm) {
        bestKm = km;
        best = i;
      }
    });
    ordered.push(remaining.splice(best, 1)[0]);
  }
  return withStops(route, ordered);
}

export interface RouteTotals {
  stops: number;
  /** Sum of time spent at the stops. */
  onSiteMin: number;
  /** Sum of known transport legs. */
  travelMin: number;
  /** Straight-line distance along the stops. */
  km: number;
}

export function routeTotals(route: Route, place: (id: string) => Place | undefined): RouteTotals {
  let onSite = 0;
  let travel = 0;
  let km = 0;
  let prev: Coordinates | undefined;

  for (const stop of route.stops) {
    const p = place(stop.placeId);
    onSite += stop.recommendedDurationMin ?? p?.recommendedDurationMin ?? 0;
    travel += stop.transportToNext?.durationMin ?? 0;
    if (p) {
      if (prev) km += haversineKm(prev.lat, prev.lng, p.coordinates.lat, p.coordinates.lng);
      prev = p.coordinates;
    }
  }
  return { stops: route.stops.length, onSiteMin: onSite, travelMin: travel, km };
}

export function distanceKm(a: Coordinates, b: Coordinates): number {
  return haversineKm(a.lat, a.lng, b.lat, b.lng);
}

export function formatMinutes(min: number): string {
  if (!min || min < 1) return '0 мин';
  if (min < 60) return `${Math.round(min)} мин`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} м` : `${km.toFixed(km < 10 ? 1 : 0)} км`;
}

/**
 * Google Maps directions link through all stops (up to 9 intermediate points are supported).
 * Note: Google ignores waypoints for transit mode, so walking is the default.
 */
export function directionsUrl(
  points: Coordinates[],
  mode: 'walking' | 'driving' | 'bicycling' | 'transit' = 'walking',
): { url: string; truncated: boolean } | null {
  if (points.length < 2) return null;

  const MAX_POINTS = 11; // origin + 9 waypoints + destination
  const used = points.slice(0, MAX_POINTS);
  const fmt = (c: Coordinates) => `${c.lat},${c.lng}`;
  const middle = used.slice(1, -1).map(fmt);

  const params = new URLSearchParams({
    api: '1',
    origin: fmt(used[0]),
    destination: fmt(used[used.length - 1]),
    travelmode: mode,
  });
  if (middle.length) params.set('waypoints', middle.join('|'));

  return {
    url: `https://www.google.com/maps/dir/?${params.toString()}`,
    truncated: points.length > MAX_POINTS,
  };
}

/** ISO dates from start to end inclusive (capped to 60 days). */
export function tripDates(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (d <= last && out.length < 60) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
