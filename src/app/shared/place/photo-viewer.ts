import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';

import { PlacePhoto } from '../../core/models';
import { PhotoImg } from '../photo-img';

/** Full-screen photos: swipe or use the arrows; the author and licence are always shown. */
@Component({
  selector: 'app-photo-viewer',
  imports: [PhotoImg],
  templateUrl: './photo-viewer.html',
  styleUrl: './photo-viewer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoViewer {
  readonly photos = input.required<PlacePhoto[]>();
  readonly index = input(0);
  readonly title = input('');
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly strip = viewChild.required<ElementRef<HTMLElement>>('strip');

  protected readonly current = signal(0);
  protected readonly photo = computed(() => this.photos()[this.current()]);

  constructor() {
    afterNextRender(() => {
      this.dialog().nativeElement.showModal();
      this.current.set(this.index());
      const el = this.strip().nativeElement;
      el.scrollLeft = this.index() * el.clientWidth;
    });
  }

  protected onScroll(): void {
    const el = this.strip().nativeElement;
    if (el.clientWidth) this.current.set(Math.max(0, Math.min(this.photos().length - 1, Math.round(el.scrollLeft / el.clientWidth))));
  }

  protected go(delta: number): void {
    const el = this.strip().nativeElement;
    const next = Math.max(0, Math.min(this.photos().length - 1, this.current() + delta));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    this.current.set(next);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') this.go(1);
    if (event.key === 'ArrowLeft') this.go(-1);
  }

  protected close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }
}
