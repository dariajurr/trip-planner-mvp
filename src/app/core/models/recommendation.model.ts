export type RecommendationReason =
  | 'weather'
  | 'fuji-visibility'
  | 'schedule'
  | 'fixed-date'
  | 'not-visited'
  | 'nearby'
  | 'user-preference';

export interface RouteRecommendation {
  routeId: string;
  score: number;
  reasons: string[];
  reasonTypes: RecommendationReason[];
  warnings?: string[];
}
