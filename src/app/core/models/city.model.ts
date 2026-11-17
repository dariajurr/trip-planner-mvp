import { Coordinates } from './coordinates.model';
import { PlacePhoto } from './photo.model';

export interface City {
  id: string;
  countryId: string;
  name: string;
  nameLocal?: string;
  /** IANA timezone, e.g. Asia/Tokyo. */
  timezone: string;
  coordinates?: Coordinates;
  /** The picture that illustrates the city (banner of the days). */
  photo?: PlacePhoto;
}
