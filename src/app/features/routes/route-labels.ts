import { RouteTag, TransportType } from '../../core/models';

export const TAG_LABELS: Record<RouteTag, string> = {
  culture: 'Культура',
  shopping: 'Шопинг',
  food: 'Еда',
  photo: 'Фото',
  night: 'Вечер и ночь',
  nature: 'Природа',
  'day-trip': 'Поездка на день',
  vintage: 'Винтаж',
  city: 'Город',
};

export const ALL_TAGS = Object.keys(TAG_LABELS) as RouteTag[];

export const TRANSPORT: Record<TransportType, { icon: string; label: string }> = {
  walk: { icon: '🚶', label: 'Пешком' },
  train: { icon: '🚆', label: 'Поезд' },
  metro: { icon: '🚇', label: 'Метро' },
  bus: { icon: '🚌', label: 'Автобус' },
  tram: { icon: '🚋', label: 'Трамвай' },
  taxi: { icon: '🚕', label: 'Такси' },
};

export const TRANSPORT_TYPES = Object.keys(TRANSPORT) as TransportType[];
