export type TransportType = 'walk' | 'train' | 'metro' | 'bus' | 'tram' | 'taxi';

export interface TransportOption {
  type: TransportType;
  durationMin?: number;
  line?: string;
  from?: string;
  to?: string;
  note?: string;
}
