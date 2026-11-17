import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ContentService } from '../../core/services/content.service';
import { PhotoFinderService } from '../../core/services/photo-finder.service';
import { SettingsService } from '../../core/services/settings.service';
import { TripStateStore } from '../../core/state/trip-state.store';
import { TEXT_SIZE_INFO, THEME_INFO, TextSize, ThemeId } from '../../core/utils/settings-utils';

@Component({
  selector: 'app-settings-page',
  imports: [RouterLink],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  protected readonly settings = inject(SettingsService);
  protected readonly finder = inject(PhotoFinderService);
  private readonly content = inject(ContentService);
  private readonly tripState = inject(TripStateStore);

  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly themes = THEME_INFO;
  protected readonly sizes = TEXT_SIZE_INFO;

  private readonly tripPlaces = computed(() => this.tripState.cities().flatMap(c => this.content.getPlacesByCity(c.id)));

  protected readonly coverage = computed(() => {
    const places = this.tripPlaces();
    const cities = this.tripState.cities();
    return {
      places: places.length,
      withPhotos: places.filter(p => p.photos?.length).length,
      cities: cities.length,
      withCityPhoto: cities.filter(c => c.photo).length,
    };
  });

  /** Photos and descriptions for the places of the current trip that have none yet, then a picture for each city. */
  protected async findAll(): Promise<void> {
    this.busy.set(true);
    this.message.set(null);
    try {
      const todo = this.tripPlaces().filter(p => !p.photos?.length || !p.description);
      const enriched = await this.finder.run(todo);
      const state = this.finder.progress();
      if (state.state === 'offline') {
        this.message.set('Не удалось связаться с Википедией. Проверьте интернет и повторите: найденное сохранено.');
        return;
      }
      let cityPhotos = 0;
      if (state.state === 'done') {
        for (const city of this.tripState.cities().filter(c => !c.photo)) {
          try {
            if (await this.finder.findCityPhoto(city)) cityPhotos++;
          } catch {
            // a city without a picture simply keeps the coloured banner
          }
        }
      }
      this.message.set(
        state.state === 'cancelled'
          ? `Остановлено. Фото найдено у точек: ${enriched}.`
          : `Готово: новые фото у точек ${enriched}, описания у ${state.withText}${cityPhotos ? `, картинки городов: ${cityPhotos}` : ''}. Не нашлось подходящего у ${Math.max(0, todo.length - enriched)}: для них можно добавить своё фото.`,
      );
    } finally {
      this.busy.set(false);
    }
  }

  /** Stores on the device the pictures that are only known by address (for example after a sync). */
  protected async cacheForOffline(): Promise<void> {
    this.busy.set(true);
    this.message.set(null);
    try {
      const { missing, stored } = await this.finder.cacheMissing(this.tripPlaces(), this.tripState.cities());
      this.message.set(
        !missing
          ? 'Все фото уже сохранены на этом устройстве.'
          : stored === missing
            ? `Скачано фото для работы без интернета: ${stored}.`
            : stored
              ? `Скачано ${stored} из ${missing}. Остальные не загрузились: проверьте интернет и повторите.`
              : 'Не удалось скачать фото. Проверьте интернет и повторите.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected pickTheme(id: ThemeId): void {
    this.settings.setTheme(id);
  }

  protected pickSize(id: TextSize): void {
    this.settings.setTextSize(id);
  }
}
