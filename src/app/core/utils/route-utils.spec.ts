import { Place, Route, RouteStop } from '../models';
import { addStops, directionsUrl, formatKm, formatMinutes, moveStop, removeStop, reorderNearest, routeTotals, tripDates, updateStop } from './route-utils';

const stop = (placeId: string, extra: Partial<RouteStop> = {}): RouteStop => ({ placeId, order: 0, priority: 'optional', ...extra });
const route = (stops: RouteStop[]): Route => ({ id: 'r', title: 'R', tags: [], stops: stops.map((s, i) => ({ ...s, order: i + 1 })) });
const ids = (r: Route) => r.stops.map(s => s.placeId);
const walk = (min: number) => ({ type: 'walk' as const, durationMin: min });

describe('route edits', () => {
  it('adds places at the end, skipping duplicates, and renumbers', () => {
    const r = addStops(route([stop('a')]), [
      { id: 'a', priority: 'must' },
      { id: 'b', priority: 'must', recommendedDurationMin: 30 },
      { id: 'b', priority: 'must' },
    ]);
    expect(ids(r)).toEqual(['a', 'b']);
    expect(r.stops.map(s => s.order)).toEqual([1, 2]);
    expect(r.stops[1].priority).toBe('must');
    expect(r.stops[1].recommendedDurationMin).toBe(30);
  });

  it('moves a stop and ignores out-of-range moves', () => {
    const r = route([stop('a'), stop('b'), stop('c')]);
    expect(ids(moveStop(r, 2, -1))).toEqual(['a', 'c', 'b']);
    expect(moveStop(r, 0, -1)).toBe(r);
    expect(moveStop(r, 2, 1)).toBe(r);
  });

  it('drops transport legs whose next stop changed, keeps the intact ones', () => {
    const r = route([stop('a', { transportToNext: walk(5) }), stop('b', { transportToNext: walk(7) }), stop('c')]);
    const moved = moveStop(r, 1, 1); // a, c, b
    expect(moved.stops.find(s => s.placeId === 'a')!.transportToNext).toBeUndefined();
    const removedLast = removeStop(r, 2); // b is now last
    expect(removedLast.stops[1].transportToNext).toBeUndefined();
    expect(removedLast.stops[0].transportToNext).toEqual(walk(5));
    const removedFirst = removeStop(r, 0); // b -> c leg intact
    expect(removedFirst.stops[0].transportToNext).toEqual(walk(7));
    expect(removedFirst.stops[0].order).toBe(1);
  });

  it('updates a stop: duration, priority, transport (and clears them)', () => {
    const r = updateStop(route([stop('a'), stop('b')]), 0, { priority: 'must', recommendedDurationMin: 45, transportToNext: walk(10) });
    expect(r.stops[0]).toEqual(jasmine.objectContaining({ priority: 'must', recommendedDurationMin: 45, transportToNext: walk(10) }));
    const cleared = updateStop(r, 0, { recommendedDurationMin: null, transportToNext: null });
    expect(cleared.stops[0].recommendedDurationMin).toBeUndefined();
    expect(cleared.stops[0].transportToNext).toBeUndefined();
  });

  it('does not mutate the input route', () => {
    const r = route([stop('a'), stop('b')]);
    const snapshot = JSON.stringify(r);
    moveStop(r, 0, 1); removeStop(r, 0); addStops(r, [{ id: 'z', priority: 'must' }]); updateStop(r, 0, { priority: 'must' });
    expect(JSON.stringify(r)).toBe(snapshot);
  });
});

describe('reorderNearest', () => {
  const coords: Record<string, { lat: number; lng: number }> = {
    a: { lat: 0, lng: 0 }, far: { lat: 0, lng: 10 }, near: { lat: 0, lng: 1 }, mid: { lat: 0, lng: 5 },
  };
  it('keeps the first stop and chains the nearest next ones', () => {
    const r = reorderNearest(route([stop('a'), stop('far'), stop('near'), stop('mid')]), id => coords[id]);
    expect(ids(r)).toEqual(['a', 'near', 'mid', 'far']);
    expect(r.stops.map(s => s.order)).toEqual([1, 2, 3, 4]);
  });
  it('leaves short routes and unknown coordinates alone', () => {
    const short = route([stop('a'), stop('b')]);
    expect(reorderNearest(short, () => undefined)).toBe(short);
    expect(ids(reorderNearest(route([stop('a'), stop('x'), stop('y')]), () => undefined))).toEqual(['a', 'x', 'y']);
  });
});

describe('routeTotals', () => {
  const place = (id: string, lng: number, dur?: number): Place => ({
    id, name: id, category: 'other', priority: 'optional', areaId: 'x',
    coordinates: { lat: 0, lng }, schedule: { weekdays: null, openingHours: null }, ...(dur ? { recommendedDurationMin: dur } : {}),
  });
  const places: Record<string, Place> = { a: place('a', 0, 20), b: place('b', 0.01), c: place('c', 0.02, 15) };

  it('sums on-site time (stop value wins over place), travel time and distance', () => {
    const r = route([stop('a', { recommendedDurationMin: 60, transportToNext: walk(10) }), stop('b', { transportToNext: walk(5) }), stop('c')]);
    const t = routeTotals(r, id => places[id]);
    expect(t.stops).toBe(3);
    expect(t.onSiteMin).toBe(60 + 0 + 15);
    expect(t.travelMin).toBe(15);
    expect(t.km).toBeGreaterThan(2.1);
    expect(t.km).toBeLessThan(2.3);
  });

  it('ignores unknown places', () => {
    expect(routeTotals(route([stop('ghost')]), () => undefined)).toEqual({ stops: 1, onSiteMin: 0, travelMin: 0, km: 0 });
  });
});

describe('formatting and links', () => {
  it('formats minutes and distance', () => {
    expect(formatMinutes(45)).toBe('45 мин');
    expect(formatMinutes(90)).toBe('1 ч 30 мин');
    expect(formatMinutes(120)).toBe('2 ч');
    expect(formatKm(0.42)).toBe('400 м');
    expect(formatKm(1.234)).toBe('1.2 км');
    expect(formatKm(12.6)).toBe('13 км');
  });

  it('builds a directions url with waypoints and flags truncation', () => {
    const pts = Array.from({ length: 13 }, (_, i) => ({ lat: i, lng: i }));
    const r = directionsUrl(pts)!;
    expect(r.truncated).toBe(true);
    const url = new URL(r.url);
    expect(url.searchParams.get('origin')).toBe('0,0');
    expect(url.searchParams.get('destination')).toBe('10,10');
    expect(url.searchParams.get('waypoints')!.split('|').length).toBe(9);
    expect(directionsUrl([pts[0]])).toBeNull();
    expect(directionsUrl(pts.slice(0, 2))!.url).not.toContain('waypoints');
  });

  it('lists trip dates inclusive', () => {
    expect(tripDates('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(tripDates('2026-12-05', '2026-12-01')).toEqual([]);
  });
});
