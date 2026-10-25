import { TransportOption } from './transport.model';

export type RouteTag =
  | 'culture'
  | 'shopping'
  | 'food'
  | 'photo'
  | 'night'
  | 'nature'
  | 'day-trip'
  | 'vintage'
  | 'city';

export interface RouteStop {
  placeId: string;
  order: number;
  priority: 'must' | 'optional';
  recommendedDurationMin?: number;
  transportToNext?: TransportOption;
}

/**
 * A reusable ordered set of stops. Cities are derived from the stops
 * (a route may span several cities, e.g. Kamakura -> Yokohama).
 */
export interface Route {
  id: string;
  title: string;
  icon?: string;
  description?: string;
  stops: RouteStop[];
  tags: RouteTag[];
  weatherDependent?: boolean;
  recommendedStartTime?: string;
  recommendedEndTime?: string;
  recommendedDurationMin?: number;
}
