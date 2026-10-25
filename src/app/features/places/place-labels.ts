import { PhotoDifficulty, PhotoTime, PlaceCategory } from '../../core/models';

export const CATEGORY_LABELS: Record<PlaceCategory, { icon: string; label: string }> = {
  temple: { icon: '⛩️', label: 'Храм' },
  shrine: { icon: '⛩️', label: 'Святилище' },
  landmark: { icon: '📍', label: 'Достопримечательность' },
  viewpoint: { icon: '🌆', label: 'Смотровая' },
  shopping: { icon: '🛍️', label: 'Шопинг' },
  market: { icon: '🧺', label: 'Рынок' },
  street: { icon: '🏮', label: 'Улица' },
  park: { icon: '🌳', label: 'Парк' },
  museum: { icon: '🖼️', label: 'Музей' },
  district: { icon: '🏙️', label: 'Район' },
  beach: { icon: '🏖️', label: 'Пляж' },
  restaurant: { icon: '🍜', label: 'Еда' },
  event: { icon: '🎟️', label: 'Событие' },
  other: { icon: '📌', label: 'Другое' },
};

export const PHOTO_TIME_LABELS: Record<PhotoTime, string> = {
  morning: 'Утро',
  day: 'День',
  'golden-hour': 'Золотой час',
  sunset: 'Закат',
  night: 'Ночь',
  any: 'Любое время',
};

export const PHOTO_DIFFICULTY_LABELS: Record<PhotoDifficulty, string> = {
  easy: 'Легко',
  medium: 'Средне',
  hard: 'Сложно',
};

export function formatDuration(min: number | undefined): string | null {
  if (!min) {
    return null;
  }
  if (min < 60) {
    return `${min} мин`;
  }
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}
