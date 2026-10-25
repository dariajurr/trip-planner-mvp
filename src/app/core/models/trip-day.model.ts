/** A single day of a trip; assignedRouteIds come from UserState.assignedRoutes. */
export interface TripDay {
  tripId: string;
  date: string;
  assignedRouteIds: string[];
  notes?: string;
}
