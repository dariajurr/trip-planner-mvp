import { DEFAULT_SETTINGS, THEME_IDS, THEME_INFO, TEXT_SIZE_INFO, TEXT_SIZES, normalizeSettings, resolveTheme } from './settings-utils';

describe('normalizeSettings', () => {
  it('defaults to the light classic theme and normal text, whatever the system is', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.theme).toBe('classic');
  });

  it('keeps valid values', () => {
    expect(normalizeSettings({ theme: 'sepia', textSize: 'large' })).toEqual({ version: 1, theme: 'sepia', textSize: 'large' });
  });

  it('replaces unknown or damaged values one by one', () => {
    expect(normalizeSettings({ theme: 'neon', textSize: 'large' })).toEqual({ version: 1, theme: 'classic', textSize: 'large' });
    expect(normalizeSettings({ theme: 'ocean', textSize: 7 })).toEqual({ version: 1, theme: 'ocean', textSize: 'normal' });
    expect(normalizeSettings('garbage')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings([])).toEqual(DEFAULT_SETTINGS);
  });
});

describe('resolveTheme', () => {
  it('auto follows the system, other themes ignore it', () => {
    expect(resolveTheme('auto', false)).toBe('classic');
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('sakura', true)).toBe('sakura');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('theme and size lists', () => {
  it('every id has a description exactly once', () => {
    expect(THEME_INFO.map(t => t.id).sort()).toEqual([...THEME_IDS].sort());
    expect(TEXT_SIZE_INFO.map(t => t.id).sort()).toEqual([...TEXT_SIZES].sort());
  });
});
