import { Coordinates } from './coordinates.model';

/** A district/neighbourhood inside a city. Places and photo spots are grouped by area. */
export interface Area {
  id: string;
  cityId: string;
  name: string;
  nameLocal?: string;
  coordinates?: Coordinates;
  description?: string;
}
