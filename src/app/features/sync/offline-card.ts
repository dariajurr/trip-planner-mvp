import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { PwaService } from '../../core/services/pwa.service';
import { SyncService } from '../../core/services/sync.service';
import { formatBytes } from '../../core/utils/pwa-utils';

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Status of offline mode, updates, installation and data protection. */
@Component({
  selector: 'app-offline-card',
  templateUrl: './offline-card.html',
  styleUrl: './offline-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfflineCard {
  protected readonly pwa = inject(PwaService);
  private readonly sync = inject(SyncService);

  protected readonly usage = computed(() => {
    const s = this.pwa.storage();
    return s ? `${formatBytes(s.usage)} из ${formatBytes(s.quota)}` : null;
  });

  protected readonly backup = computed(() => {
    const last = this.sync.lastExport();
    return last ? `Последняя копия: ${when(last)}` : 'Копий ещё не было';
  });

  protected async protect(): Promise<void> {
    await this.pwa.requestPersistence();
    await this.pwa.refreshStorage();
  }
}
