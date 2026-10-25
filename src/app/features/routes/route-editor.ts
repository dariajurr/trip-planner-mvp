import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';

import { Route, RouteTag } from '../../core/models';
import { RouteMeta } from '../../core/services/route-edit.service';
import { ALL_TAGS, TAG_LABELS } from './route-labels';

/** Dialog for the route's own properties (not its stops). */
@Component({
  selector: 'app-route-editor',
  templateUrl: './route-editor.html',
  styleUrl: './route-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RouteEditor {
  readonly route = input<Route | null>(null);
  readonly saved = output<RouteMeta>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly tags = ALL_TAGS.map(tag => ({ tag, label: TAG_LABELS[tag] }));
  protected readonly title = signal('');
  protected readonly icon = signal('🗺️');
  protected readonly description = signal('');
  protected readonly selected = signal<RouteTag[]>([]);
  protected readonly weather = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly isEdit = computed(() => this.route() !== null);

  constructor() {
    afterNextRender(() => {
      const r = this.route();
      if (r) {
        this.title.set(r.title);
        this.icon.set(r.icon ?? '');
        this.description.set(r.description ?? '');
        this.selected.set([...r.tags]);
        this.weather.set(!!r.weatherDependent);
      }
      this.dialog().nativeElement.showModal();
    });
  }

  protected on(signalRef: { set(v: string): void }, event: Event): void {
    signalRef.set((event.target as HTMLInputElement).value);
  }

  protected toggleTag(tag: RouteTag): void {
    this.selected.update(list => (list.includes(tag) ? list.filter(t => t !== tag) : [...list, tag]));
  }

  protected save(): void {
    if (!this.title().trim()) {
      this.error.set('Введите название маршрута.');
      return;
    }
    this.saved.emit({
      title: this.title(),
      icon: this.icon(),
      description: this.description(),
      tags: this.selected(),
      weatherDependent: this.weather(),
    });
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
