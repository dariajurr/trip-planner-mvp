import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';

import { Coordinates, PlaceUserStatus } from '../../core/models';
import { ContentService } from '../../core/services/content.service';
import { PhotoFinderService } from '../../core/services/photo-finder.service';
import { PlaceViewService, routeUrl } from '../../core/services/place-view.service';
import { UserStateStore } from '../../core/state/user-state.store';
import { PhotoViewer } from '../../shared/place/photo-viewer';
import { PhotoImg } from '../../shared/photo-img';
import { PlaceEditor } from './place-editor';

const STATUS_ACTIONS: { value: PlaceUserStatus; label: string }[] = [
  { value: 'want', label: 'Хочу' },
  { value: 'visited', label: 'Был' },
  { value: 'not-wanted', label: 'Не хочу' },
];

/** "Подробнее": gallery, description, practical details, personal marks and note, edit. */
@Component({
  selector: 'app-place-sheet',
  imports: [PhotoImg, PhotoViewer, PlaceEditor],
  templateUrl: './place-sheet.html',
  styleUrl: './place-sheet.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceSheet {
  private readonly content = inject(ContentService);
  private readonly view = inject(PlaceViewService);
  private readonly userState = inject(UserStateStore);
  private readonly finder = inject(PhotoFinderService);

  readonly placeId = input.required<string>();
  /** The previous stop of the day, as the start of the route. */
  readonly from = input<Coordinates | null>(null);
  readonly closed = output<void>();

  protected readonly statusActions = STATUS_ACTIONS;
  protected readonly viewer = signal<number | null>(null);
  protected readonly editing = signal(false);
  protected readonly searching = signal(false);
  protected readonly message = signal<string | null>(null);

  protected readonly vm = computed(() => {
    const place = this.content.getPlace(this.placeId());
    return place ? this.view.vm(place) : null;
  });

  protected readonly note = computed(() => this.userState.notes()[this.placeId()]?.text ?? '');
  protected readonly route = computed(() => {
    const vm = this.vm();
    return vm ? routeUrl(vm.place.coordinates, this.from()) : '';
  });

  constructor() {
    // the place was deleted in the editor: nothing to show any more
    effect(() => {
      if (!this.vm() && !untracked(this.editing)) this.closed.emit();
    });
  }

  protected setStatus(status: PlaceUserStatus): void {
    const vm = this.vm();
    if (!vm) return;
    if (vm.status === status) this.userState.clearPlaceStatus(vm.place.id);
    else this.userState.setPlaceStatus(vm.place.id, status);
  }

  protected toggleFavorite(): void {
    this.userState.toggleFavorite(this.placeId());
  }

  protected onNote(event: Event): void {
    this.userState.setNote(this.placeId(), (event.target as HTMLTextAreaElement).value.trim());
  }

  protected async findPhotos(): Promise<void> {
    const vm = this.vm();
    if (!vm) return;
    this.searching.set(true);
    this.message.set(null);
    try {
      const before = vm.photos.length;
      await this.finder.run([vm.place]);
      const state = this.finder.progress();
      const after = this.vm()?.photos.length ?? before;
      this.message.set(
        state.state === 'offline' || state.failed ? 'Не удалось связаться с Википедией. Проверьте интернет.' : after > before ? `Найдено фото: ${after - before}.` : 'Подходящих фото рядом с этой точкой не нашлось. Можно добавить своё через «Изменить».',
      );
    } finally {
      this.searching.set(false);
    }
  }
}
