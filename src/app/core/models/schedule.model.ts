export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface OpeningHours {
  from: string;
  to: string;
}

export interface SpecialDateSchedule {
  date: string;
  available: boolean;
  openingHours?: OpeningHours | null;
  note?: string;
}

export interface PlaceSchedule {
  weekdays: Weekday[] | null;
  openingHours: OpeningHours | null;
  shopHours?: OpeningHours | null;
  specialDates?: SpecialDateSchedule[] | null;
  note?: string;
  /** Raw opening hours when they cannot be reduced to one range (e.g. OSM syntax). */
  hoursText?: string;
}
