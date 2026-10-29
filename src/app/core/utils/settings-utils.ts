export const THEME_IDS = ['auto', 'classic', 'ocean', 'sakura', 'sunset', 'lavender', 'sepia', 'contrast', 'dark'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
/** A theme that has colours of its own ("auto" only chooses between two of them). */
export type ConcreteTheme = Exclude<ThemeId, 'auto'>;

export const TEXT_SIZES = ['normal', 'large', 'xlarge'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export interface Settings {
  version: 1;
  theme: ThemeId;
  textSize: TextSize;
}

export const DEFAULT_SETTINGS: Settings = { version: 1, theme: 'classic', textSize: 'normal' };

export const THEME_INFO: { id: ThemeId; name: string; hint: string }[] = [
  { id: 'classic', name: 'Классика', hint: 'Светлая, зелёный акцент' },
  { id: 'ocean', name: 'Океан', hint: 'Светлая, прохладный голубой' },
  { id: 'sakura', name: 'Сакура', hint: 'Светлая, нежно-розовая' },
  { id: 'sunset', name: 'Закат', hint: 'Светлая, тёплая терракотовая' },
  { id: 'lavender', name: 'Лаванда', hint: 'Светлая, сиреневая' },
  { id: 'sepia', name: 'Сепия', hint: 'Бумажная, мягкая для глаз' },
  { id: 'contrast', name: 'Контраст', hint: 'Максимальная читаемость, для яркого солнца' },
  { id: 'dark', name: 'Тёмная', hint: 'Тёмный фон' },
  { id: 'auto', name: 'Как в системе', hint: 'Светлая днём, тёмная, если так в телефоне' },
];

export const TEXT_SIZE_INFO: { id: TextSize; name: string }[] = [
  { id: 'normal', name: 'Обычный' },
  { id: 'large', name: 'Крупный' },
  { id: 'xlarge', name: 'Очень крупный' },
];

/** Accepts whatever is stored (possibly from an older or damaged version) and returns valid settings. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    version: 1,
    theme: (THEME_IDS as readonly unknown[]).includes(r['theme']) ? (r['theme'] as ThemeId) : DEFAULT_SETTINGS.theme,
    textSize: (TEXT_SIZES as readonly unknown[]).includes(r['textSize']) ? (r['textSize'] as TextSize) : DEFAULT_SETTINGS.textSize,
  };
}

/** "Auto" follows the system: the light classic theme, or the dark one when the system is dark. */
export function resolveTheme(theme: ThemeId, systemDark: boolean): ConcreteTheme {
  return theme === 'auto' ? (systemDark ? 'dark' : 'classic') : theme;
}
