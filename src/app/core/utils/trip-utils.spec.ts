import { Booking, FlightBooking, HotelBooking, Trip } from '../models';
import { cityOnDay, groupTrips, inferDestinations, inferTripFromBookings, pickDefaultTrip, tripLength, tripPhase } from './trip-utils';
import { airportCity } from '../data/airports';

const trip = (id: string, startDate: string, endDate: string): Trip => ({ id, title: id, startDate, endDate, cityIds: [] });

describe('trip phases and the default trip', () => {
  const today = '2026-12-03';
  const past = trip('past', '2026-06-01', '2026-06-10');
  const now = trip('now', '2026-12-01', '2026-12-08');
  const soon = trip('soon', '2027-01-10', '2027-01-20');
  const later = trip('later', '2027-05-01', '2027-05-10');
  const old = trip('old', '2025-01-01', '2025-01-05');

  it('tells where a trip is relative to today, including the boundary days', () => {
    expect(tripPhase(now, today)).toBe('current');
    expect(tripPhase(trip('x', '2026-12-03', '2026-12-04'), today)).toBe('current');
    expect(tripPhase(trip('x', '2026-12-01', '2026-12-03'), today)).toBe('current');
    expect(tripPhase(soon, today)).toBe('upcoming');
    expect(tripPhase(past, today)).toBe('past');
  });

  it('groups: upcoming soonest first, past latest first', () => {
    const g = groupTrips([later, old, now, past, soon], today);
    expect(g.current.map(t => t.id)).toEqual(['now']);
    expect(g.upcoming.map(t => t.id)).toEqual(['soon', 'later']);
    expect(g.past.map(t => t.id)).toEqual(['past', 'old']);
  });

  it('default trip: in progress, else next, else the latest finished, else none', () => {
    expect(pickDefaultTrip([later, now, soon], today)?.id).toBe('now');
    expect(pickDefaultTrip([later, soon, past], today)?.id).toBe('soon');
    expect(pickDefaultTrip([old, past], today)?.id).toBe('past');
    expect(pickDefaultTrip([], today)).toBeUndefined();
  });

  it('counts days inclusively', () => {
    expect(tripLength(now)).toBe(8);
    expect(tripLength(trip('one', '2026-12-01', '2026-12-01'))).toBe(1);
  });
});

describe('airportCity', () => {
  it('names the city, not the airport', () => {
    expect(airportCity('HND')).toBe('Tokyo');
    expect(airportCity('NRT')).toBe('Tokyo');
    expect(airportCity('JFK')).toBe('New York');
    expect(airportCity('SVO')).toBe('Moscow');
    expect(airportCity('CXR')).toBe('Nha Trang');
    expect(airportCity('SGN')).toBe('Ho Chi Minh City');
    expect(airportCity('ZZZ')).toBe('ZZZ');
  });
});

const leg = (n: string, from: string, to: string, d1: string, t1: string, d2: string, t2: string): FlightBooking => ({
  id: n, tripId: 't', kind: 'flight', flightNumber: n, from, to, departure: { date: d1, time: t1 }, arrival: { date: d2, time: t2 },
});
const hotel = (name: string, a: string, b: string): HotelBooking => ({ id: name, tripId: 't', kind: 'hotel', name, checkIn: { date: a }, checkOut: { date: b } });

// the real itinerary: Moscow - Guangzhou - Tokyo - Guangzhou - Nha Trang - Guangzhou - Moscow
const OZON: FlightBooking[] = [
  leg('CZ 656', 'SVO', 'CAN', '2026-11-30', '23:15', '2026-12-01', '13:30'),
  leg('CZ 3085', 'CAN', 'HND', '2026-12-01', '15:10', '2026-12-01', '20:00'),
  leg('CZ 3086', 'HND', 'CAN', '2026-12-08', '10:45', '2026-12-08', '15:00'),
  leg('CZ 6049', 'CAN', 'CXR', '2026-12-08', '16:15', '2026-12-08', '17:40'),
  leg('CZ 8476', 'CXR', 'CAN', '2026-12-12', '10:40', '2026-12-12', '14:30'),
  leg('CZ 8027', 'CAN', 'SVO', '2026-12-13', '07:40', '2026-12-13', '13:00'),
];

describe('inferDestinations', () => {
  it('finds Tokyo and Nha Trang; Guangzhou is only a connection and Moscow is home', () => {
    const d = inferDestinations(OZON);
    expect(d.map(x => [x.code, x.city, x.countryCode])).toEqual([['HND', 'Tokyo', 'JP'], ['CXR', 'Nha Trang', 'VN']]);
    expect(d[0].arrival).toEqual({ date: '2026-12-01', time: '20:00' });
    expect(d[0].departure).toEqual({ date: '2026-12-08', time: '10:45' });
    expect(d[1].departure).toEqual({ date: '2026-12-12', time: '10:40' });
  });

  it('a simple round trip has one destination, whatever the order of the input', () => {
    const rt = [leg('LH 717', 'HND', 'FRA', '2026-12-19', '23:15', '2026-12-20', '05:40'), leg('LH 716', 'FRA', 'HND', '2026-12-12', '11:45', '2026-12-13', '07:10')];
    expect(inferDestinations(rt).map(d => d.city)).toEqual(['Tokyo']);
  });

  it('a one-way flight ends at the destination', () => {
    expect(inferDestinations([leg('LH 716', 'FRA', 'HND', '2026-12-12', '11:45', '2026-12-13', '07:10')]).map(d => d.city)).toEqual(['Tokyo']);
  });

  it('a layover of a day or more counts as a stay, a shorter one does not', () => {
    const long = [leg('A1', 'FRA', 'IST', '2026-03-01', '17:00', '2026-03-01', '20:55'), leg('A2', 'IST', 'HND', '2026-03-02', '22:50', '2026-03-03', '19:00'), leg('A3', 'HND', 'FRA', '2026-03-09', '11:00', '2026-03-09', '16:00')];
    expect(inferDestinations(long).map(d => d.city)).toEqual(['Istanbul', 'Tokyo']);
    const short = [leg('A1', 'FRA', 'IST', '2026-03-01', '17:00', '2026-03-01', '20:55'), leg('A2', 'IST', 'HND', '2026-03-01', '23:50', '2026-03-02', '19:00')];
    expect(inferDestinations(short).map(d => d.city)).toEqual(['Tokyo']);
  });

  it('does not mistake a second airport of the home city for a destination', () => {
    expect(inferDestinations([leg('A1', 'SVO', 'HND', '2026-12-01', '10:00', '2026-12-02', '02:00'), leg('A2', 'HND', 'DME', '2026-12-08', '10:00', '2026-12-08', '16:00')]).map(d => d.city)).toEqual(['Tokyo']);
  });

  it('nothing without flights', () => {
    expect(inferDestinations([])).toEqual([]);
  });
});

describe('inferTripFromBookings', () => {
  it('turns the real itinerary into a Japan + Vietnam trip for 1-12 December', () => {
    const s = inferTripFromBookings(OZON)!;
    expect(s.title).toBe('Япония + Вьетнам, декабрь 2026');
    expect([s.startDate, s.endDate]).toEqual(['2026-12-01', '2026-12-12']);
    expect(s.countryCodes).toEqual(['JP', 'VN']);
    expect(s.cities).toEqual([{ name: 'Tokyo', countryCode: 'JP' }, { name: 'Nha Trang', countryCode: 'VN' }]);
  });

  it('a hotel stay inside the trip does not change the range', () => {
    const s = inferTripFromBookings([...OZON, hotel('Tourist Hotel', '2026-12-01', '2026-12-08')] as Booking[])!;
    expect([s.startDate, s.endDate]).toEqual(['2026-12-01', '2026-12-12']);
  });

  it('a Japan-only return trip', () => {
    const s = inferTripFromBookings([leg('LH 716', 'FRA', 'HND', '2026-12-12', '11:45', '2026-12-13', '07:10'), leg('LH 717', 'HND', 'FRA', '2026-12-19', '23:15', '2026-12-20', '05:40')])!;
    expect(s.title).toBe('Япония, декабрь 2026');
    expect([s.startDate, s.endDate]).toEqual(['2026-12-13', '2026-12-19']);
  });

  it('with only hotels, the dates come from the stays and the title is generic', () => {
    const s = inferTripFromBookings([hotel('Inn', '2026-05-02', '2026-05-09')])!;
    expect([s.startDate, s.endDate, s.title]).toEqual(['2026-05-02', '2026-05-09', 'Поездка, май 2026']);
    expect(s.cities).toEqual([]);
  });

  it('nothing to go on gives no suggestion', () => {
    expect(inferTripFromBookings([])).toBeNull();
  });
});

describe('cityOnDay', () => {
  const trip = (city: string) => city === 'Tokyo' || city === 'Nha Trang';

  it('follows the real itinerary: Tokyo, then Nha Trang from the evening of the 8th, connections ignored', () => {
    expect(cityOnDay(OZON, '2026-11-30', trip)).toBeUndefined();
    expect(cityOnDay(OZON, '2026-12-01', trip)).toBeUndefined(); // lands in Tokyo at 20:00, after noon
    expect(cityOnDay(OZON, '2026-12-02', trip)).toBe('Tokyo');
    expect(cityOnDay(OZON, '2026-12-08', trip)).toBe('Tokyo'); // Nha Trang is reached only at 17:40
    expect(cityOnDay(OZON, '2026-12-09', trip)).toBe('Nha Trang');
    expect(cityOnDay(OZON, '2026-12-12', trip)).toBe('Nha Trang');
  });

  it('nothing without flights', () => {
    expect(cityOnDay([], '2026-12-02', trip)).toBeUndefined();
  });
});
