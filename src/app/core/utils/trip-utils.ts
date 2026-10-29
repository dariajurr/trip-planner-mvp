import { airportCity, airportCountry } from '../data/airports';
import { countryNameRu } from '../data/countries';
import { Booking, FlightBooking, LocalDateTime, Trip } from '../models';
import { suggestTripRange } from './booking-utils';
import { daysBetween } from './dates';

export type TripPhase = 'current' | 'upcoming' | 'past';

export function tripPhase(trip: Pick<Trip, 'startDate' | 'endDate'>, today: string): TripPhase {
  if (today < trip.startDate) return 'upcoming';
  if (today > trip.endDate) return 'past';
  return 'current';
}

/** The trip to show when nothing was chosen: the one in progress, else the next one, else the latest finished. */
export function pickDefaultTrip(trips: Trip[], today: string): Trip | undefined {
  const g = groupTrips(trips, today);
  return g.current[0] ?? g.upcoming[0] ?? g.past[0];
}

export function groupTrips(trips: Trip[], today: string): Record<TripPhase, Trip[]> {
  const out: Record<TripPhase, Trip[]> = { current: [], upcoming: [], past: [] };
  for (const t of trips) out[tripPhase(t, today)].push(t);
  out.current.sort((a, b) => a.endDate.localeCompare(b.endDate));
  out.upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));
  out.past.sort((a, b) => b.endDate.localeCompare(a.endDate));
  return out;
}

export function tripLength(trip: Pick<Trip, 'startDate' | 'endDate'>): number {
  return daysBetween(trip.startDate, trip.endDate) + 1;
}

// ---- working out a trip from bookings ---------------------------------------
export interface Destination {
  /** Airport where the traveller arrives. */
  code: string;
  city: string;
  countryCode: string;
  arrival: LocalDateTime;
  /** When the traveller leaves again (unknown for a one-way trip's last stop). */
  departure?: LocalDateTime;
}

const HOURS_AT_DESTINATION = 24;
const at = (d: LocalDateTime) => Date.parse(`${d.date}T${d.time ?? '12:00'}:00Z`);

/**
 * Places the traveller really stays in, as opposed to connections: a layover shorter than a day
 * does not count, and neither does the way home (the airport the journey started from).
 * Arrival and the next departure are both local times of the same airport, so no time zone maths is needed.
 */
export function inferDestinations(flights: FlightBooking[]): Destination[] {
  const legs = [...flights].sort((a, b) => at(a.departure) - at(b.departure));
  if (!legs.length) return [];

  const origin = legs[0].from;
  const originCity = airportCity(origin);
  const out: Destination[] = [];

  legs.forEach((leg, i) => {
    const code = leg.to;
    if (code === origin || airportCity(code) === originCity) return;

    const arrival = leg.arrival ?? leg.departure;
    const next = legs[i + 1];
    const continuesFromHere = next && next.from === code;
    const stayHours = continuesFromHere ? (at(next.departure) - at(arrival)) / 3_600_000 : null;
    if (continuesFromHere && stayHours !== null && stayHours < HOURS_AT_DESTINATION) return; // a connection

    if (out.some(d => d.code === code)) return;
    out.push({
      code,
      city: airportCity(code),
      countryCode: airportCountry(code) ?? '',
      arrival,
      ...(continuesFromHere ? { departure: next.departure } : {}),
    });
  });
  return out;
}

export interface TripSuggestion {
  title: string;
  startDate: string;
  endDate: string;
  destinations: Destination[];
  /** Cities to put in the trip: the places the traveller stays in. */
  cities: { name: string; countryCode: string }[];
  countryCodes: string[];
}

const MONTHS_RU = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/** A trip (title, dates, cities) that fits the bookings, to be reviewed by the user. */
export function inferTripFromBookings(bookings: Booking[]): TripSuggestion | null {
  const flights = bookings.filter((b): b is FlightBooking => b.kind === 'flight');
  const destinations = inferDestinations(flights);
  const countryCodes = [...new Set(destinations.map(d => d.countryCode).filter(Boolean))];

  const range = suggestTripRange(bookings, countryCodes);
  if (!range) return null;

  const cities: TripSuggestion['cities'] = [];
  for (const d of destinations) if (!cities.some(c => c.name === d.city)) cities.push({ name: d.city, countryCode: d.countryCode });

  const where = countryCodes.length ? countryCodes.map(countryNameRu).join(' + ') : cities.map(c => c.name).join(' + ') || 'Поездка';
  const [year, month] = range.start.split('-').map(Number);
  return {
    title: `${where}, ${MONTHS_RU[month - 1]} ${year}`,
    startDate: range.start,
    endDate: range.end,
    destinations,
    cities,
    countryCodes,
  };
}

/**
 * The city the traveller is in around noon of the given day, judging by flights: the latest landing
 * (local time) in one of the allowed cities up to that moment. Landing in a connection city does not count.
 */
export function cityOnDay(flights: FlightBooking[], date: string, allowed: (city: string) => boolean): string | undefined {
  const noon = Date.parse(`${date}T12:00:00Z`);
  let best: { city: string; at: number } | undefined;
  for (const f of flights) {
    const landing = f.arrival ?? f.departure;
    const at = Date.parse(`${landing.date}T${landing.time ?? '12:00'}:00Z`);
    const city = airportCity(f.to);
    if (at <= noon && allowed(city) && (!best || at > best.at)) best = { city, at };
  }
  return best?.city;
}
