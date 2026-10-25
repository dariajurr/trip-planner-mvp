import { findDates, findTimes } from './booking-dates';
import { BookingDraft, FlightDraft, HotelDraft, parseBookingText } from './booking-parser';

const opts = { defaultYear: 2026 };
const flights = (d: BookingDraft[]) => d.filter((x): x is FlightDraft => x.kind === 'flight');
const hotels = (d: BookingDraft[]) => d.filter((x): x is HotelDraft => x.kind === 'hotel');

describe('findDates', () => {
  const iso = (s: string, y = 2026) => findDates(s, y).map(d => d.date);

  it('reads many formats in several languages', () => {
    expect(iso('Sat, 12 Dec 2026')).toEqual(['2026-12-12']);
    expect(iso('December 12th, 2026')).toEqual(['2026-12-12']);
    expect(iso('12. Dezember 2026')).toEqual(['2026-12-12']);
    expect(iso('12 декабря 2026 г.')).toEqual(['2026-12-12']);
    expect(iso('2026-12-12')).toEqual(['2026-12-12']);
    expect(iso('2026/12/12')).toEqual(['2026-12-12']);
    expect(iso('2026年12月12日')).toEqual(['2026-12-12']);
    expect(iso('12.12.2026')).toEqual(['2026-12-12']);
    expect(iso('Sa., 12. Dez. 2026')).toEqual(['2026-12-12']);
  });

  it('uses the default year when missing and flags it', () => {
    const [d] = findDates('Dec 12', 2026);
    expect(d.date).toBe('2026-12-12');
    expect(d.hasYear).toBe(false);
  });

  it('confirms the year by the weekday written next to the date', () => {
    expect(findDates('Sat, Dec 12', 2026)[0]).toEqual(jasmine.objectContaining({ date: '2026-12-12', hasYear: true }));
    expect(findDates('1 December, Tuesday, from 15:00', 2026)[0]).toEqual(jasmine.objectContaining({ date: '2026-12-01', hasYear: true }));
    expect(findDates('Samstag, 12. Dezember', 2026)[0].hasYear).toBe(true);
    expect(findDates('Sun, Dec 12', 2026)[0]).toEqual(jasmine.objectContaining({ date: '2027-12-12', hasYear: true })); // next year fits the weekday
  });

  it('keeps the guess flagged when the weekday fits no nearby year', () => {
    expect(findDates('Mon, Dec 12', 2026)[0]).toEqual(jasmine.objectContaining({ date: '2026-12-12', hasYear: false }));
  });

  it('handles numeric order: day-first, US order when the day is above 12, ambiguity flagged', () => {
    expect(findDates('19.12.2026', 2026)[0].date).toBe('2026-12-19');
    expect(findDates('12/19/2026', 2026)[0].date).toBe('2026-12-19');
    expect(findDates('03.04.2026', 2026)[0]).toEqual(jasmine.objectContaining({ date: '2026-04-03', ambiguous: true }));
  });

  it('rejects impossible dates and does not read "Dec 2026" as a day', () => {
    expect(iso('31.02.2026')).toEqual([]);
    expect(iso('Dec 2026')).toEqual([]);
  });
});

describe('findTimes', () => {
  it('reads 24h, 12h and Uhr', () => {
    expect(findTimes('11:45 and 3:00 PM and 11:00 AM and 9 Uhr and 12:30 am').map(t => t.time)).toEqual(['11:45', '15:00', '11:00', '09:00', '00:30']);
  });
  it('does not take seconds or decimals as times', () => {
    expect(findTimes('12:45:30 and 3.45')).toEqual([]);
  });
});

describe('parseBookingText: flights', () => {
  const LH = `Your booking confirmation
Booking reference: X7K2LM
Outbound flight
Sat, 12 Dec 2026
LH 716 Frankfurt (FRA) – Tokyo Haneda (HND)
Departure 11:45 Arrival 07:10 +1
Operated by Lufthansa
Boarding 11:05
Return flight
Sat, 19 Dec 2026
LH 717 Tokyo Haneda (HND) – Frankfurt (FRA)
Departure 23:15 Arrival 05:40 +1
Booked on 01 Oct 2026`;

  it('parses a two-leg itinerary with +1 arrivals', () => {
    const f = flights(parseBookingText(LH, opts));
    expect(f.length).toBe(2);
    expect(f[0]).toEqual(jasmine.objectContaining({ flightNumber: 'LH 716', airline: 'Lufthansa', from: 'FRA', to: 'HND', depDate: '2026-12-12', depTime: '11:45', arrDate: '2026-12-13', arrTime: '07:10', confirmation: 'X7K2LM' }));
    expect(f[1]).toEqual(jasmine.objectContaining({ flightNumber: 'LH 717', from: 'HND', to: 'FRA', depDate: '2026-12-19', depTime: '23:15', arrDate: '2026-12-20', arrTime: '05:40' }));
  });

  it('ignores boarding times and booking dates', () => {
    const f = flights(parseBookingText(LH, opts));
    expect(f[0].depTime).toBe('11:45');
    expect(f.some(x => x.depDate === '2026-10-01')).toBe(false);
  });

  it('parses a German itinerary', () => {
    const f = flights(parseBookingText(`Buchungscode: ABC123
Hinflug 12. Dezember 2026
LH 716 Frankfurt (FRA) - Tokio (HND)
Abflug 11:45 Uhr  Ankunft 07:10 Uhr (+1 Tag)`, opts));
    expect(f.length).toBe(1);
    expect(f[0]).toEqual(jasmine.objectContaining({ from: 'FRA', to: 'HND', depDate: '2026-12-12', depTime: '11:45', arrDate: '2026-12-13', confirmation: 'ABC123' }));
  });

  it('parses a Russian e-ticket with explicit dates for departure and arrival', () => {
    const f = flights(parseBookingText(`Номер бронирования: QW12ER
SU 262 Москва SVO 12 декабря 2026 10:05 → Токио NRT 13 декабря 2026 00:30`, opts));
    expect(f[0]).toEqual(jasmine.objectContaining({ flightNumber: 'SU 262', from: 'SVO', to: 'NRT', depDate: '2026-12-12', depTime: '10:05', arrDate: '2026-12-13', arrTime: '00:30' }));
  });

  it('guesses the next day when arrival is earlier than departure, and says so', () => {
    const f = flights(parseBookingText('12 Dec 2026\nNH 212 HND → SIN\nDep 23:00 Arr 05:00', opts));
    expect(f[0].arrDate).toBe('2026-12-13');
    expect(f[0].warnings.join(' ')).toContain('следующий день');
  });

  it('warns about missing year and missing data', () => {
    const f = flights(parseBookingText('Dec 12\nJL 44 HND → FRA', opts));
    expect(f[0].depDate).toBe('2026-12-12');
    expect(f[0].warnings.join(' ')).toContain('нет года');
    expect(f[0].warnings.join(' ')).toContain('время вылета');
  });

  it('merges a flight listed twice and keeps the more complete entry', () => {
    const f = flights(parseBookingText(`Summary: LH 716 on 12 Dec 2026
Details
12 Dec 2026
LH 716 Frankfurt (FRA) – Tokyo (HND)
Departure 11:45 Arrival 07:10 +1`, opts));
    expect(f.length).toBe(1);
    expect(f[0].depTime).toBe('11:45');
  });

  it('does not invent flights from IBANs or unrelated codes', () => {
    expect(parseBookingText('IBAN DE12 3456 7890 1234 5678 90\nPayment due 12.12.2026 at 10:00\nPage 4 of 5', opts)).toEqual([]);
    expect(parseBookingText('Windows OS 10 and A4 paper, size 12', opts)).toEqual([]);
  });
});

describe('parseBookingText: hotels', () => {
  it('parses a Booking.com style confirmation', () => {
    const h = hotels(parseBookingText(`Your booking is confirmed
Hotel Gracery Shinjuku
Kabukicho 1-19-1, Shinjuku, Tokyo, 160-8466, Japan
Confirmation number: 4837291056
Check-in: Sat, 12 Dec 2026 (from 15:00)
Check-out: Sat, 19 Dec 2026 (until 11:00)
Total price: JPY 120,000`, opts));
    expect(h.length).toBe(1);
    expect(h[0]).toEqual(jasmine.objectContaining({ name: 'Hotel Gracery Shinjuku', checkInDate: '2026-12-12', checkInTime: '15:00', checkOutDate: '2026-12-19', checkOutTime: '11:00', confirmation: '4837291056' }));
    expect(h[0].address).toContain('160-8466');
  });

  it('parses an Airbnb style layout with labels on separate lines and no year', () => {
    const h = hotels(parseBookingText(`Reservation code HMXQ2Z5K9A
Cozy flat near Ueno Station
Check-in
Sat, Dec 12
3:00 PM
Checkout
Sat, Dec 19
11:00 AM
Address
2-3-4 Ueno, Taito City, Tokyo 110-0005, Japan`, opts));
    expect(h[0]).toEqual(jasmine.objectContaining({ name: 'Cozy flat near Ueno Station', checkInDate: '2026-12-12', checkInTime: '15:00', checkOutDate: '2026-12-19', checkOutTime: '11:00', confirmation: 'HMXQ2Z5K9A' }));
    expect(h[0].address).toContain('Ueno');
    expect(h[0].warnings.join(' ')).not.toContain('нет года'); // "Sat, Dec 12" fits 2026
    expect(h[0].warnings.join(' ')).toContain('Название определено по положению');
  });

  it('parses German labels', () => {
    const h = hotels(parseBookingText(`Hotel Sunroute Plaza
Buchungsnummer: 99887766
Anreise: Sa., 12. Dez. 2026 (ab 15:00 Uhr)
Abreise: Sa., 19. Dez. 2026 (bis 11:00 Uhr)`, opts));
    expect(h[0]).toEqual(jasmine.objectContaining({ name: 'Hotel Sunroute Plaza', checkInDate: '2026-12-12', checkInTime: '15:00', checkOutDate: '2026-12-19', checkOutTime: '11:00', confirmation: '99887766' }));
  });

  it('parses Russian labels', () => {
    const h = hotels(parseBookingText(`Отель Токио Бэй
Заезд: 12 декабря 2026 г., с 15:00
Выезд: 19 декабря 2026 г., до 11:00`, opts));
    expect(h[0]).toEqual(jasmine.objectContaining({ name: 'Отель Токио Бэй', checkInDate: '2026-12-12', checkOutDate: '2026-12-19' }));
  });

  it('finds several stays in one document', () => {
    const h = hotels(parseBookingText(`Hotel Alpha Tokyo
Check-in: 12 Dec 2026 15:00
Check-out: 15 Dec 2026 11:00

Hotel Beta Kyoto
Check-in: 15 Dec 2026 14:00
Check-out: 19 Dec 2026 10:00`, opts));
    expect(h.map(x => [x.name, x.checkInDate, x.checkOutDate])).toEqual([
      ['Hotel Alpha Tokyo', '2026-12-12', '2026-12-15'],
      ['Hotel Beta Kyoto', '2026-12-15', '2026-12-19'],
    ]);
  });

  it('does not treat an airline "check-in" as a hotel stay', () => {
    const d = parseBookingText('Online check-in opens 24 hours before departure.\nLH 716 FRA → HND 12 Dec 2026 11:45', opts);
    expect(hotels(d)).toEqual([]);
    expect(flights(d).length).toBe(1);
  });

  it('warns when the name is missing', () => {
    const h = hotels(parseBookingText('Check-in: 12 Dec 2026\nCheck-out: 19 Dec 2026', opts));
    expect(h[0].name).toBe('');
    expect(h[0].warnings.join(' ')).toContain('название');
  });
});

describe('parseBookingText: compact routes', () => {
  it('reads airports written as FRA-HND and FRA → HND', () => {
    const f = flights(parseBookingText('12 Dec 2026\nLH 716 FRA-HND 11:45 07:10 +1\nNH 212 HND→FRA 19 Dec 2026 14:10 18:30', opts));
    expect(f.map(x => [x.from, x.to])).toEqual([['FRA', 'HND'], ['HND', 'FRA']]);
  });
});

describe('parseBookingText: mixed and empty', () => {
  it('returns flights and hotels from one document, empty for empty text', () => {
    const d = parseBookingText(`12 Dec 2026\nLH 716 FRA → HND\nDeparture 11:45 Arrival 07:10 +1\nHotel Gracery\nCheck-in: 13 Dec 2026\nCheck-out: 19 Dec 2026`, opts);
    expect(flights(d).length).toBe(1);
    expect(hotels(d).length).toBe(1);
    expect(parseBookingText('', opts)).toEqual([]);
    expect(parseBookingText('Hello world', opts)).toEqual([]);
  });
});


// ---- layouts taken from real documents (personal data replaced) --------------
describe('parseBookingText: Ozon Travel e-ticket (three columns, time before date)', () => {
  const TICKET = `Eticket   Order Number   bilet@ozon.travel *
Z351297600001   922 26750
Order status: OK
TICKET NUMBER / ISSUING AIRLINE BOOKING REF / DATE NAME / FORM OF IDENTIFICATION
784395500000000   China Southern Airlines ABC12D   Doe Jane Ms
China Southern Airlines   24 September 2026   778500000
DEPARTURE FLIGHT / BAGGAGE CONNECTION
23:15, 30 November 2026   CZ 656   13:30, 1 December 2026
Moscow   China Southern Airlines, economy, E, E2ASRURS   Guangzhou
Sheremetyevo (SVO), Terminal C   1 piece 23kg, hand luggage 8kg   Guangzhou Baiyun International (CAN), Terminal 2
DEPARTURE FLIGHT / BAGGAGE ARRIVAL
15:10, 1 December 2026   CZ 3085   20:00, 1 December 2026
Guangzhou   China Southern Airlines, economy, E, E2ASRURS   Tokyo
Guangzhou Baiyun International (CAN), Terminal 2 1 piece 23kg, hand luggage 8kg   Haneda (HND), Terminal 3
DEPARTURE FLIGHT / BAGGAGE CONNECTION
10:45, 8 December 2026   CZ 3086   15:00, 8 December 2026
Tokyo   China Southern Airlines, economy, A, V2APAURS   Guangzhou
Haneda (HND), Terminal 3   1 piece 23kg, hand luggage 8kg   Guangzhou Baiyun International (CAN), Terminal 2
DEPARTURE FLIGHT / BAGGAGE ARRIVAL
16:15, 8 December 2026   CZ 6049   17:40, 8 December 2026
Guangzhou   China Southern Airlines, economy, A, A2LSRYIS   Nha Trang
Guangzhou Baiyun International (CAN), Terminal 2 1 piece 23kg, hand luggage 8kg   Cam Ranh (CXR), Terminal 2
DEPARTURE FLIGHT / BAGGAGE CONNECTION
10:40, 12 December 2026   CZ 8476   14:30, 12 December 2026
Nha Trang   China Southern Airlines, economy, V, V2LSRUIS   Guangzhou
Cam Ranh (CXR), Terminal 2   1 piece 23kg, hand luggage 8kg   Guangzhou Baiyun International (CAN), Terminal 2
DEPARTURE FLIGHT / BAGGAGE ARRIVAL
07:40, 13 December 2026   CZ 8027   13:00, 13 December 2026
Guangzhou   China Southern Airlines, economy, V, V2APAURS   Moscow
Guangzhou Baiyun International (CAN), Terminal 2 1 piece 23kg, hand luggage 8kg   Sheremetyevo (SVO), Terminal C
Air fare: RUB 35700.00   Form of payment: cash
Total: RUB 76184.00
Notice
If the passenger's journey involves an ultimate destination or stop in a country other than the country of departure the warsaw convention may be applicable.`;

  it('reads all six segments with the right dates, not the ticket issue date', () => {
    const f = flights(parseBookingText(TICKET, opts));
    expect(f.map(x => [x.flightNumber, x.from, x.to, x.depDate, x.depTime, x.arrDate, x.arrTime])).toEqual([
      ['CZ 656', 'SVO', 'CAN', '2026-11-30', '23:15', '2026-12-01', '13:30'],
      ['CZ 3085', 'CAN', 'HND', '2026-12-01', '15:10', '2026-12-01', '20:00'],
      ['CZ 3086', 'HND', 'CAN', '2026-12-08', '10:45', '2026-12-08', '15:00'],
      ['CZ 6049', 'CAN', 'CXR', '2026-12-08', '16:15', '2026-12-08', '17:40'],
      ['CZ 8476', 'CXR', 'CAN', '2026-12-12', '10:40', '2026-12-12', '14:30'],
      ['CZ 8027', 'CAN', 'SVO', '2026-12-13', '07:40', '2026-12-13', '13:00'],
    ]);
  });

  it('takes the booking reference printed under the "BOOKING REF" heading, with no warnings', () => {
    const f = flights(parseBookingText(TICKET, opts));
    expect(f.every(x => x.confirmation === 'ABC12D')).toBe(true);
    expect(f.every(x => x.airline === 'China Southern' && x.warnings.length === 0)).toBe(true);
  });
});

describe('parseBookingText: Ozon Travel hotel voucher (labels on their own lines, no year)', () => {
  const VOUCHER = `Check-in
1 December, Tuesday, from 15:00 until 00:00   When contacting the hotel, please provide the names of
Check-out   the guests and the dates of stay.
8 December, Tuesday, until 10:00
Hotel
The Tourist Hotel & Cafe Akihabara
Address
1-6-6 Taito, Taito, Tokyo, Japan
Hotel contacts
+81000000000, <info@example.jp>
Payment details
Paid
Room
double room
Meal
No meals
The registration desk operating hours are 05:00 - 00:00. On-site parking is available for an additional fee of 2000 JPY per vehicle
Notify the hotel in advance if you plan to check in later.
The hotel may charge a local tourist tax, which is payable directly to the hotel by the guest.
If you have any problems, write to us in the support chat.
Be prepared to give your order number to Ozon: Z-12345678-0002`;

  it('takes the name from the line under the "Hotel" heading, not the heading or a sentence', () => {
    const h = hotels(parseBookingText(VOUCHER, opts));
    expect(h.length).toBe(1);
    expect(h[0]).toEqual(jasmine.objectContaining({
      name: 'The Tourist Hotel & Cafe Akihabara',
      address: '1-6-6 Taito, Taito, Tokyo, Japan',
      checkInDate: '2026-12-01', checkInTime: '15:00',
      checkOutDate: '2026-12-08', checkOutTime: '10:00',
      confirmation: 'Z-12345678-0002',
    }));
  });

  it('knows the year from the weekday, so there is no year warning', () => {
    expect(hotels(parseBookingText(VOUCHER, opts))[0].warnings).toEqual([]);
  });
});
