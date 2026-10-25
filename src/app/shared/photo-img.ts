import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';

import { PlacePhoto } from '../core/models';
import { PhotoStorageService } from '../core/services/photo-storage.service';

/** Shows a place photo: the local copy from IndexedDB if there is one, otherwise the remote URL. */
@Component({
  selector: 'app-photo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (src(); as s) {
    <img [src]="s" [alt]="photo().caption ?? ''" loading="lazy" decoding="async" />
  }`,
  styles: `
    :host { display: block; background: var(--accent-soft); overflow: hidden; }
    img { display: block; width: 100%; height: 100%; object-fit: cover; }
  `,
})
export class PhotoImg {
  private readonly store = inject(PhotoStorageService);

  readonly photo = input.required<PlacePhoto>();
  protected readonly src = signal<string | null>(null);

  constructor() {
    effect(onCleanup => {
      const photo = this.photo();
      let objectUrl: string | null = null;
      let cancelled = false;

      onCleanup(() => {
        cancelled = true;
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      });

      void this.store.get(photo.id).then(blob => {
        if (cancelled) {
          return;
        }
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          this.src.set(objectUrl);
        } else {
          this.src.set(photo.url ?? null);
        }
      });
    });
  }
}
