import { Coordinates } from './coordinates.model';

export type FoodCategory =
  | 'ramen' | 'soba' | 'udon' | 'sushi' | 'yakitori' | 'okonomiyaki'
  | 'takoyaki' | 'gyoza' | 'yakiniku' | 'donburi' | 'izakaya'
  | 'seafood' | 'other';

export interface PriceRange {
  min?: number;
  max?: number;
  currency: string;
}

export interface FoodSpot {
  id: string;
  name: string;
  category: FoodCategory;
  description?: string;
  coordinates: Coordinates;
  areaId: string;
  priceRange?: PriceRange;
  placeIds?: string[];
  routeIds?: string[];
  googleMapsUrl?: string;
  tags?: string[];
}
