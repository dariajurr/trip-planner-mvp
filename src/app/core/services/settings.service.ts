import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { ConcreteTheme, Settings, TextSize, ThemeId, normalizeSettings, resolveTheme } from '../utils/settings-utils';
import { LocalStorageService } from './local-storage.service';

export const SETTINGS_KEY = 'trip-app.settings.v1';

/**
 * Personal settings of this device: colour theme and text size. They are applied to the page
 * (data-theme / data-text on <html>) and kept in localStorage. They are not synced between devices.
 * index.html applies the saved values before the app starts, so there is no flash of the wrong colours.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly storage = inject(LocalStorageService);

  private readonly _settings = signal<Settings>(normalizeSettings(this.storage.get(SETTINGS_KEY)));
  private readonly systemDark = signal(this.mediaQuery()?.matches ?? false);

  readonly settings = this._settings.asReadonly();
  /** The theme actually shown ("auto" resolved). */
  readonly effectiveTheme = computed<ConcreteTheme>(() => resolveTheme(this._settings().theme, this.systemDark()));

  constructor() {
    this.mediaQuery()?.addEventListener?.('change', event => this.systemDark.set(event.matches));

    effect(() => {
      const settings = this._settings();
      this.storage.set(SETTINGS_KEY, settings);
      this.apply(this.effectiveTheme(), settings.textSize);
    });
  }

  setTheme(theme: ThemeId): void {
    this._settings.update(s => ({ ...s, theme }));
  }

  setTextSize(textSize: TextSize): void {
    this._settings.update(s => ({ ...s, textSize }));
  }

  reset(): void {
    this._settings.set(normalizeSettings(null));
  }

  private apply(theme: ConcreteTheme, textSize: TextSize): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset['theme'] = theme;
    root.dataset['text'] = textSize;

    // the browser's own bar (and the status bar of the installed app) takes the colour of the theme
    const chrome = getComputedStyle(root).getPropertyValue('--chrome').trim();
    if (chrome) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', chrome);
  }

  private mediaQuery(): MediaQueryList | null {
    return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  }
}
