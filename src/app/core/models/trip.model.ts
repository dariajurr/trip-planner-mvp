/** A concrete journey. Countries are derived from cityIds -> City.countryId. */
export interface Trip {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  cityIds: string[];
}
