import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ExportFile } from '../../core/models';
import { ImportPreview, SyncError, SyncService } from '../../core/services/sync.service';
import { OfflineCard } from './offline-card';

@Component({
  selector: 'app-sync-page',
  imports: [RouterLink, OfflineCard],
  templateUrl: './sync-page.html',
  styleUrl: './sync-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncPage {
  protected readonly sync = inject(SyncService);

  protected readonly includePhotos = signal(true);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  private file: ExportFile | null = null;
  protected readonly preview = signal<ImportPreview | null>(null);
  protected readonly applyMarks = signal(false);

  protected readonly canShare = typeof navigator !== 'undefined' && 'share' in navigator && 'canShare' in navigator;

  protected readonly changedGroups = computed(() =>
    (this.preview()?.plan.groups ?? []).filter(g => g.stats.added + g.stats.updated + g.stats.removed + g.stats.keptLocal + g.stats.invalid > 0),
  );

  protected readonly fileInfo = computed(() => {
    const f = this.preview()?.file;
    if (!f) {
      return '';
    }
    const when = f.exportedAt ? new Date(f.exportedAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }) : '';
    return [f.deviceName ? `от «${f.deviceName}»` : '', when].filter(Boolean).join(', ');
  });

  protected onDeviceName(event: Event): void {
    this.sync.setDeviceName((event.target as HTMLInputElement).value.trim());
  }

  protected setIncludePhotos(event: Event): void {
    this.includePhotos.set((event.target as HTMLInputElement).checked);
  }

  protected async download(): Promise<void> {
    await this.run(async () => {
      const blob = await this.buildBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.sync.fileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      this.sync.markExported();
      this.message.set({ kind: 'ok', text: `Файл сохранён: ${this.sync.fileName()} (${this.size(blob)}).` });
    });
  }

  protected async share(): Promise<void> {
    await this.run(async () => {
      const blob = await this.buildBlob();
      const file = new File([blob], this.sync.fileName(), { type: 'application/json' });
      if (!navigator.canShare?.({ files: [file] })) {
        this.message.set({ kind: 'error', text: 'Это устройство не умеет делиться файлами. Используйте «Сохранить файл».' });
        return;
      }
      try {
        await navigator.share({ files: [file], title: 'Trip Planner' });
        this.sync.markExported();
      } catch (e) {
        if ((e as DOMException).name !== 'AbortError') {
          throw e;
        }
      }
    });
  }

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) {
      return;
    }
    this.message.set(null);
    this.preview.set(null);
    await this.run(async () => {
      try {
        this.file = this.sync.parse(await picked.text());
        this.applyMarks.set(false);
        this.preview.set(await this.sync.preview(this.file, { applyMarks: false }));
      } catch (e) {
        this.file = null;
        this.message.set({ kind: 'error', text: e instanceof SyncError ? e.message : 'Не удалось прочитать файл.' });
      }
    });
  }

  protected async toggleMarks(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    this.applyMarks.set(checked);
    if (this.file) {
      this.preview.set(await this.sync.preview(this.file, { applyMarks: checked }));
    }
  }

  protected async applyImport(): Promise<void> {
    const preview = this.preview();
    if (!preview) {
      return;
    }
    await this.run(async () => {
      await this.sync.apply(preview);
      this.message.set({ kind: 'ok', text: 'Готово: данные обновлены.' });
      this.preview.set(null);
      this.file = null;
    });
  }

  protected cancelImport(): void {
    this.preview.set(null);
    this.file = null;
  }

  private async buildBlob(): Promise<Blob> {
    const data = await this.sync.buildExport({ includePhotos: this.includePhotos() });
    return new Blob([JSON.stringify(data)], { type: 'application/json' });
  }

  private size(blob: Blob): string {
    return blob.size > 1024 * 1024 ? `${(blob.size / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(blob.size / 1024))} КБ`;
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await fn();
    } catch {
      this.message.set({ kind: 'error', text: 'Что-то пошло не так. Попробуйте ещё раз.' });
    } finally {
      this.busy.set(false);
    }
  }
}
