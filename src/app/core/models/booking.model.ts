/** A local date and optional time at the place itself (no time zone conversion). */
export interface LocalDateTime {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, 24 hour */
  time?: string;
}

/** The original document (PDF, e-mail...), stored on the device so it works offline. */
export interface BookingAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
}

interface BookingBase {
  id: string;
  tripId: string;
  confirmation?: string;
  notes?: string;
  attachments?: BookingAttachment[];
}

export interface FlightBooking extends BookingBase {
  kind: 'flight';
  /** e.g. "LH 716" */
  flightNumber: string;
  airline?: string;
  /** IATA airport codes */
  from: string;
  to: string;
  departure: LocalDateTime;
  arrival?: LocalDateTime;
}

export interface HotelBooking extends BookingBase {
  kind: 'hotel';
  name: string;
  address?: string;
  cityId?: string;
  checkIn: LocalDateTime;
  checkOut: LocalDateTime;
}

export type Booking = FlightBooking | HotelBooking;
