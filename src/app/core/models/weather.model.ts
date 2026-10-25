export type WeatherType =
  | 'clear' | 'partly-cloudy' | 'cloudy' | 'rain'
  | 'snow' | 'storm' | 'fog';

export type FujiForecastLevel = 'poor' | 'possible' | 'good' | 'excellent';

export interface FujiForecast {
  score: number;
  level: FujiForecastLevel;
  confidence?: number;
  reason?: string;
}

export interface WeatherDay {
  date: string;
  temperatureMin: number;
  temperatureMax: number;
  weather: WeatherType;
  precipitationProbability?: number;
  cloudCover?: number;
  visibility?: number;
  sunrise?: string;
  sunset?: string;
  fuji?: FujiForecast;
}
