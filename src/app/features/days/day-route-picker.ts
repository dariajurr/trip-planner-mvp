import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, viewChild } from '@angular/core';

import { ContentService } from '../../core/services/content.service';
import { RecommendationService } from '../../core/services/recommendation.service';
import { TripStateStore } from '../../core/state/trip-state.store';
import { UserStateStore } from '../../core/state/user-state.store';
import { formatMinutes, routeTotals } from '../../core/utils/route-utils';

/** Dialog: pick one of the trip's routes for a day (most suitable first). */
@Component({
  selector: 'app-day-route-picker',
  templateUrl: './day-route-picker.html',
  styleUrl: './day-route-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayRoutePicker {
  private readonly content = inject(ContentService);
  private readonly tripState = inject(TripStateStore);
  private readonly userState = inject(UserStateStore);
  private readonly recommendations = inject(RecommendationService);

  readonly date = input.required<string>();
  readonly picked = output<string>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly items = computed(() => {
    const trip = this.tripState.trip();
    if (!trip) return [];
    const date = this.date();

    return this.recommendations.getRecommendations(trip.id, date).flatMap(rec => {
      const route = this.content.getRoute(rec.routeId);
      if (!route) return [];
      const totals = routeTotals(route, id => this.content.getPlace(id));
      const minutes = route.recommendedDurationMin ?? totals.onSiteMin + totals.travelMin;
      return [{
        id: route.id,
        icon: route.icon ?? '🗺️',
        title: route.title,
        stops: route.stops.length,
        duration: minutes ? formatMinutes(minutes) : null,
        reasons: rec.reasons.filter(r => !r.startsWith('уже назначен')).join(' · '),
        weather: !!route.weatherDependent,
        taken: this.userState.isRouteAssigned(trip.id, route.id, date),
        empty: route.stops.length === 0,
      }];
    });
  });

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  protected pick(id: string): void {
    this.picked.emit(id);
    this.close();
  }

  protected close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
