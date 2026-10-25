import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { Route, RouteTag } from '../../core/models';
import { ContentService } from '../../core/services/content.service';
import { RecommendationService } from '../../core/services/recommendation.service';
import { RouteEditService } from '../../core/services/route-edit.service';
import { TripStateStore } from '../../core/state/trip-state.store';
import { UserStateStore } from '../../core/state/user-state.store';
import { formatMinutes, routeTotals } from '../../core/utils/route-utils';
import { RouteEditor } from './route-editor';
import { TAG_LABELS } from './route-labels';

interface RouteVm {
  route: Route;
  icon: string;
  stops: number;
  duration: string | null;
  cities: string;
  tags: { tag: RouteTag; label: string }[];
  visited: number;
  percent: number;
  reasons: string;
  warnings: string | null;
  custom: boolean;
  empty: boolean;
}

@Component({
  selector: 'app-routes-page',
  imports: [RouterLink, RouteEditor],
  templateUrl: './routes-page.html',
  styleUrl: './routes-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoutesPage {
  private readonly content = inject(ContentService);
  private readonly tripState = inject(TripStateStore);
  private readonly userState = inject(UserStateStore);
  private readonly recommendations = inject(RecommendationService);
  private readonly edits = inject(RouteEditService);
  private readonly router = inject(Router);

  protected readonly cityId = signal<string | null>(null);
  protected readonly tag = signal<RouteTag | null>(null);
  protected readonly creating = signal(false);

  protected readonly cities = this.tripState.cities;

  private readonly all = computed<RouteVm[]>(() => {
    const trip = this.tripState.trip();
    if (!trip) return [];

    return this.recommendations.getRecommendations(trip.id).flatMap(rec => {
      const route = this.content.getRoute(rec.routeId);
      if (!route) return [];

      const totals = routeTotals(route, id => this.content.getPlace(id));
      const total = route.recommendedDurationMin ?? totals.onSiteMin + totals.travelMin;
      const visited = route.stops.filter(s => this.userState.isVisited(s.placeId)).length;

      return [{
        route,
        icon: route.icon ?? '🗺️',
        stops: route.stops.length,
        duration: total ? formatMinutes(total) : null,
        cities: this.content.getRouteCityIds(route).map(id => this.content.getCity(id)?.name ?? '').filter(Boolean).join(' → '),
        tags: route.tags.map(t => ({ tag: t, label: TAG_LABELS[t] ?? t })),
        visited,
        percent: route.stops.length ? Math.round((visited / route.stops.length) * 100) : 0,
        reasons: rec.reasons.join(' · '),
        warnings: rec.warnings?.join(' · ') ?? null,
        custom: route.id.startsWith('u-'),
        empty: route.stops.length === 0,
      }];
    });
  });

  protected readonly tagChips = computed(() => {
    const present = new Set(this.all().flatMap(vm => vm.route.tags));
    return [...present].map(t => ({ tag: t, label: TAG_LABELS[t] ?? t }));
  });

  protected readonly items = computed(() => {
    const cityId = this.cityId();
    const tag = this.tag();
    return this.all().filter(
      vm =>
        (!cityId || this.content.getRouteCityIds(vm.route).includes(cityId)) &&
        (!tag || vm.route.tags.includes(tag)),
    );
  });

  protected readonly topId = computed(() => {
    const first = this.all().find(vm => !vm.empty && vm.percent < 100);
    return first?.route.id ?? null;
  });

  protected create(meta: Parameters<RouteEditService['create']>[0]): void {
    const id = this.edits.create(meta);
    void this.router.navigate(['/routes', id]);
  }
}
