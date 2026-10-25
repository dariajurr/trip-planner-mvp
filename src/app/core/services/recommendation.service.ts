import { Injectable, inject } from '@angular/core';

import { ContentService } from './content.service';
import { UserStateStore } from '../state/user-state.store';
import { Route, RouteRecommendation } from '../models';

@Injectable({ providedIn: 'root' })
export class RecommendationService {
  private readonly content = inject(ContentService);
  private readonly userState = inject(UserStateStore);

  /** Only routes that fit the trip's cities are scored. */
  getRecommendations(tripId: string, date?: string): RouteRecommendation[] {
    return this.content.getRoutesForTrip(tripId)
      .map(route => this.scoreRoute(tripId, route, date))
      .sort((a, b) => b.score - a.score);
  }

  private scoreRoute(tripId: string, route: Route, date?: string): RouteRecommendation {
    const placeIds = route.stops.map(stop => stop.placeId);

    const notWantedCount = placeIds.filter(id => this.userState.isNotWanted(id)).length;
    const unvisitedCount = placeIds.filter(id => !this.userState.isVisited(id)).length;
    const favoriteCount = placeIds.filter(id => this.userState.isFavorite(id)).length;

    let score = 0;
    const reasons: string[] = [];
    const reasonTypes: RouteRecommendation['reasonTypes'] = [];
    const warnings: string[] = [];

    score += unvisitedCount * 5;
    if (unvisitedCount > 0) {
      reasons.push(`не посещено мест: ${unvisitedCount}`);
      reasonTypes.push('not-visited');
    }

    score += favoriteCount * 4;
    if (favoriteCount > 0) {
      reasons.push(`избранных мест: ${favoriteCount}`);
      reasonTypes.push('user-preference');
    }

    if (date && this.userState.isRouteAssigned(tripId, route.id, date)) {
      score += 8;
      reasons.push('уже назначен на выбранный день');
      reasonTypes.push('fixed-date');
    }

    if (notWantedCount > 0) {
      score -= notWantedCount * 12;
      warnings.push(`мест с отметкой «Не хочу»: ${notWantedCount}`);
    }

    if (!reasons.length) {
      reasons.push('доступный маршрут');
    }

    return {
      routeId: route.id,
      score,
      reasons,
      reasonTypes,
      warnings: warnings.length ? warnings : undefined,
    };
  }
}
