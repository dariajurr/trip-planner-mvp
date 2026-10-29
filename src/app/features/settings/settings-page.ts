import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SettingsService } from '../../core/services/settings.service';
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
  protected readonly themes = THEME_INFO;
  protected readonly sizes = TEXT_SIZE_INFO;

  protected pickTheme(id: ThemeId): void {
    this.settings.setTheme(id);
  }

  protected pickSize(id: TextSize): void {
    this.settings.setTextSize(id);
  }
}
