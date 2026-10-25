import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { TripStateStore } from './core/state/trip-state.store';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly tripState = inject(TripStateStore);

  protected readonly title = computed(() => this.tripState.trip()?.title ?? 'Trip Planner');

  protected readonly subtitle = computed(() => {
    const trip = this.tripState.trip();
    if (!trip) {
      return '';
    }
    const cities = this.tripState.cities().map(city => city.name).join(', ');
    const start = dateFormat.format(new Date(`${trip.startDate}T12:00:00`));
    const end = dateFormat.format(new Date(`${trip.endDate}T12:00:00`));
    return `${start} – ${end} · ${cities}`;
  });
}
