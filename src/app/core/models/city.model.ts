import { Coordinates } from './coordinates.model';

export interface City {
  id: string;
  countryId: string;
  name: string;
  nameLocal?: string;
  /** IANA timezone, e.g. Asia/Tokyo. */
  timezone: string;
  coordinates?: Coordinates;
}
