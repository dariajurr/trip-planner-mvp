import { Injectable, inject, signal } from '@angular/core';

import { EXPORT_FORMAT, EXPORT_SCHEMA_VERSION, ExportFile } from '../models';
import { UserContentStore } from '../state/user-content.store';
import { UserStateStore } from '../state/user-state.store';
import { ImportPlan, SyncError, parseExportFile, planImport } from '../utils/sync-core';
import { LocalStorageService } from './local-storage.service';
import { PhotoStorageService } from './photo-storage.service';

const DEVICE_NAME_KEY = 'trip-app.device-name';
const LAST_EXPORT_KEY = 'trip-app.last-export';
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp|gif);base64,/;
const FILE_DATA_URL = /^data:[\w/+.-]+;base64,/;

export interface ImportPreview {
  file: ExportFile;
  plan: ImportPlan;
  /** Photos from the file that this device does not have yet. */
  newPhotoIds: string[];
  /** Booking documents from the file that this device does not have yet. */
  newAttachmentIds: string[];
}

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly content = inject(UserContentStore);
  private readonly state = inject(UserStateStore);
  private readonly photos = inject(PhotoStorageService);
  private readonly storage = inject(LocalStorageService);

  readonly deviceName = signal(this.storage.get<string>(DEVICE_NAME_KEY) ?? '');

  /** When a backup file was last created on this device (ISO), if ever. */
  readonly lastExport = signal<string | null>(this.storage.get<string>(LAST_EXPORT_KEY));

  markExported(): void {
    const now = new Date().toISOString();
    this.lastExport.set(now);
    this.storage.set(LAST_EXPORT_KEY, now);
  }

  setDeviceName(name: string): void {
    this.deviceName.set(name);
    this.storage.set(DEVICE_NAME_KEY, name);
  }

  async buildExport(opts: { includePhotos: boolean }): Promise<ExportFile> {
    const content = this.content.snapshot();
    const state = this.state.snapshot();

    const file: ExportFile = {
      format: EXPORT_FORMAT,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      deviceName: this.deviceName() || undefined,
      content,
      plan: { assignedRoutes: state.assignedRoutes, notes: state.notes },
      marks: { placeStates: state.placeStates, photoSpots: state.photoSpots },
    };

    if (opts.includePhotos) {
      const photos: Record<string, string> = {};
      for (const record of Object.values(content.places)) {
        for (const photo of record.value?.photos ?? []) {
          const blob = await this.photos.get(photo.id);
          if (blob) {
            photos[photo.id] = await this.photos.toDataUrl(blob);
          }
        }
      }
      if (Object.keys(photos).length) {
        file.photos = photos;
      }

      const attachments: Record<string, string> = {};
      for (const record of Object.values(content.bookings)) {
        for (const a of record.value?.attachments ?? []) {
          const blob = await this.photos.get(a.id);
          if (blob) {
            attachments[a.id] = await this.photos.toDataUrl(new Blob([blob], { type: a.mime }));
          }
        }
      }
      if (Object.keys(attachments).length) {
        file.attachments = attachments;
      }
    }
    return file;
  }

  fileName(): string {
    return `trip-planner-${new Date().toISOString().slice(0, 10)}.json`;
  }

  parse(text: string): ExportFile {
    return parseExportFile(text);
  }

  async preview(file: ExportFile, opts: { applyMarks: boolean }): Promise<ImportPreview> {
    const plan = planImport(
      { content: this.content.snapshot(), state: this.state.snapshot() },
      file,
      opts,
    );

    const newPhotoIds: string[] = [];
    for (const [id, dataUrl] of Object.entries(file.photos ?? {})) {
      if (IMAGE_DATA_URL.test(dataUrl) && !(await this.photos.has(id))) {
        newPhotoIds.push(id);
      }
    }
    const newAttachmentIds: string[] = [];
    for (const [id, dataUrl] of Object.entries(file.attachments ?? {})) {
      if (FILE_DATA_URL.test(dataUrl) && !(await this.photos.has(id))) {
        newAttachmentIds.push(id);
      }
    }
    return { file, plan, newPhotoIds, newAttachmentIds };
  }

  async apply(preview: ImportPreview): Promise<void> {
    const { plan, file, newPhotoIds, newAttachmentIds } = preview;
    if (!plan.hasChanges && !newPhotoIds.length && !newAttachmentIds.length) {
      return;
    }

    for (const id of newPhotoIds) {
      const blob = this.photos.fromDataUrl(file.photos?.[id] ?? '');
      if (blob) {
        await this.photos.put(id, blob);
      }
    }

    for (const id of newAttachmentIds) {
      const blob = this.photos.fromDataUrl(file.attachments?.[id] ?? '');
      if (blob) {
        await this.photos.put(id, blob);
      }
    }

    this.content.replace(plan.content);
    this.state.replace({
      assignedRoutes: plan.assignedRoutes,
      notes: plan.notes,
      ...(plan.placeStates ? { placeStates: plan.placeStates } : {}),
      ...(plan.photoSpotStates ? { photoSpots: plan.photoSpotStates } : {}),
    });
  }
}

export { SyncError };
