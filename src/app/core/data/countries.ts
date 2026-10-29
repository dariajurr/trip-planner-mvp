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
