import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { Coordinates, PlaceUserStatus } from '../../core/models';
import { PlaceVm, routeUrl } from '../../core/services/place-view.service';
import { PhotoImg } from '../photo-img';

const STATUS_ACTIONS: { value: PlaceUserStatus; label: string }[] = [
  { value: 'want', label: 'Хочу' },
  { value: 'visited', label: 'Был' },
  { value: 'not-wanted', label: 'Не хочу' },
];

/**
 * One place: a photo (or a coloured placeholder with the category icon), the title, a short text
 * and the actions. Used in the list of places and in the day timeline.
 */
@Component({
  selector: 'app-place-card',
  imports: [PhotoImg],
  templateUrl: './place-card.html',
  styleUrl: './place-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceCard {
  readonly vm = input.required<PlaceVm>();
  /** The previous stop, as the start of the route to this place. */
  readonly from = input<Coordinates | null>(null);
  readonly showStatus = input(false);
  /** Time of the visit in a day timeline, e.g. "09:30". */
  readonly time = input<string | null>(null);

  readonly details = output<void>();
  readonly photo = output<number>();
  readonly favorite = output<void>();
  readonly status = output<PlaceUserStatus>();

  protected readonly statusActions = STATUS_ACTIONS;

  protected routeLink(): string {
    return routeUrl(this.vm().place.coordinates, this.from());
  }
}
