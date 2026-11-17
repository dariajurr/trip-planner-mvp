/** ISO 3166-1 alpha-2 -> English and Russian names (English is used for new catalog entries, Russian for trip titles). */
export const COUNTRY_NAMES: Record<string, { en: string; ru: string }> = {
  JP: { en: 'Japan', ru: 'Япония' }, VN: { en: 'Vietnam', ru: 'Вьетнам' }, CN: { en: 'China', ru: 'Китай' }, RU: { en: 'Russia', ru: 'Россия' },
  DE: { en: 'Germany', ru: 'Германия' }, TH: { en: 'Thailand', ru: 'Таиланд' }, KR: { en: 'South Korea', ru: 'Южная Корея' },
  SG: { en: 'Singapore', ru: 'Сингапур' }, TW: { en: 'Taiwan', ru: 'Тайвань' }, HK: { en: 'Hong Kong', ru: 'Гонконг' },
  MY: { en: 'Malaysia', ru: 'Малайзия' }, ID: { en: 'Indonesia', ru: 'Индонезия' }, PH: { en: 'Philippines', ru: 'Филиппины' },
  IN: { en: 'India', ru: 'Индия' }, LK: { en: 'Sri Lanka', ru: 'Шри-Ланка' }, TR: { en: 'Turkey', ru: 'Турция' },
  AE: { en: 'United Arab Emirates', ru: 'ОАЭ' }, QA: { en: 'Qatar', ru: 'Катар' }, IL: { en: 'Israel', ru: 'Израиль' },
  EG: { en: 'Egypt', ru: 'Египет' }, ET: { en: 'Ethiopia', ru: 'Эфиопия' }, ZA: { en: 'South Africa', ru: 'ЮАР' },
  FR: { en: 'France', ru: 'Франция' }, GB: { en: 'United Kingdom', ru: 'Великобритания' }, ES: { en: 'Spain', ru: 'Испания' },
  IT: { en: 'Italy', ru: 'Италия' }, PT: { en: 'Portugal', ru: 'Португалия' }, NL: { en: 'Netherlands', ru: 'Нидерланды' },
  BE: { en: 'Belgium', ru: 'Бельгия' }, CH: { en: 'Switzerland', ru: 'Швейцария' }, AT: { en: 'Austria', ru: 'Австрия' },
  CZ: { en: 'Czechia', ru: 'Чехия' }, PL: { en: 'Poland', ru: 'Польша' }, HU: { en: 'Hungary', ru: 'Венгрия' },
  GR: { en: 'Greece', ru: 'Греция' }, IE: { en: 'Ireland', ru: 'Ирландия' }, DK: { en: 'Denmark', ru: 'Дания' },
  SE: { en: 'Sweden', ru: 'Швеция' }, NO: { en: 'Norway', ru: 'Норвегия' }, FI: { en: 'Finland', ru: 'Финляндия' },
  IS: { en: 'Iceland', ru: 'Исландия' }, LV: { en: 'Latvia', ru: 'Латвия' }, EE: { en: 'Estonia', ru: 'Эстония' },
  LT: { en: 'Lithuania', ru: 'Литва' }, RS: { en: 'Serbia', ru: 'Сербия' }, UA: { en: 'Ukraine', ru: 'Украина' },
  BY: { en: 'Belarus', ru: 'Беларусь' }, GE: { en: 'Georgia', ru: 'Грузия' }, AM: { en: 'Armenia', ru: 'Армения' },
  KZ: { en: 'Kazakhstan', ru: 'Казахстан' }, UZ: { en: 'Uzbekistan', ru: 'Узбекистан' }, US: { en: 'United States', ru: 'США' },
  CA: { en: 'Canada', ru: 'Канада' }, MX: { en: 'Mexico', ru: 'Мексика' }, BR: { en: 'Brazil', ru: 'Бразилия' },
  AU: { en: 'Australia', ru: 'Австралия' }, NZ: { en: 'New Zealand', ru: 'Новая Зеландия' },
};

export const countryNameEn = (code: string) => COUNTRY_NAMES[code]?.en ?? code;
export const countryNameRu = (code: string) => COUNTRY_NAMES[code]?.ru ?? code;

/** Countries that have a single time zone: enough to give a new city the right local time. */
const COUNTRY_TZ: Record<string, string> = {
  JP: 'Asia/Tokyo', VN: 'Asia/Ho_Chi_Minh', CN: 'Asia/Shanghai', TH: 'Asia/Bangkok', KR: 'Asia/Seoul', SG: 'Asia/Singapore', TW: 'Asia/Taipei',
  HK: 'Asia/Hong_Kong', MY: 'Asia/Kuala_Lumpur', PH: 'Asia/Manila', IN: 'Asia/Kolkata', LK: 'Asia/Colombo', TR: 'Europe/Istanbul', AE: 'Asia/Dubai',
  QA: 'Asia/Qatar', IL: 'Asia/Jerusalem', EG: 'Africa/Cairo', ET: 'Africa/Addis_Ababa', ZA: 'Africa/Johannesburg', FR: 'Europe/Paris', GB: 'Europe/London',
  ES: 'Europe/Madrid', IT: 'Europe/Rome', PT: 'Europe/Lisbon', NL: 'Europe/Amsterdam', BE: 'Europe/Brussels', CH: 'Europe/Zurich', AT: 'Europe/Vienna',
  DE: 'Europe/Berlin', CZ: 'Europe/Prague', PL: 'Europe/Warsaw', HU: 'Europe/Budapest', GR: 'Europe/Athens', IE: 'Europe/Dublin', DK: 'Europe/Copenhagen',
  SE: 'Europe/Stockholm', NO: 'Europe/Oslo', FI: 'Europe/Helsinki', IS: 'Atlantic/Reykjavik', LV: 'Europe/Riga', EE: 'Europe/Tallinn', LT: 'Europe/Vilnius',
  RS: 'Europe/Belgrade', UA: 'Europe/Kyiv', BY: 'Europe/Minsk', GE: 'Asia/Tbilisi', AM: 'Asia/Yerevan', NZ: 'Pacific/Auckland',
};

/** IANA zone for a new city: by country when it has one zone, otherwise a fixed zone from the longitude (Etc/GMT-7 is UTC+7). */
export function defaultTimezone(countryCode?: string, lng?: number): string | undefined {
  const known = countryCode ? COUNTRY_TZ[countryCode] : undefined;
  if (known) return known;
  if (lng === undefined || !Number.isFinite(lng)) return undefined;
  const hours = Math.round(lng / 15);
  return hours === 0 ? 'Etc/UTC' : `Etc/GMT${hours > 0 ? '-' : '+'}${Math.abs(hours)}`;
}
