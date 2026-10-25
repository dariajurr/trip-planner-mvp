import { Injectable } from '@angular/core';

const DB_NAME = 'trip-app';
const STORE = 'photos';

/** Stores compressed photos as blobs in IndexedDB (localStorage is far too small for images). */
@Injectable({ providedIn: 'root' })
export class PhotoStorageService {
  private dbPromise: Promise<IDBDatabase | null> | undefined;

  private db(): Promise<IDBDatabase | null> {
    this.dbPromise ??= new Promise(resolve => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    return this.dbPromise;
  }

  private async run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
    const db = await this.db();
    if (!db) {
      return undefined;
    }
    return new Promise(resolve => {
      try {
        const request = fn(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  }

  async put(id: string, blob: Blob): Promise<boolean> {
    return (await this.run('readwrite', s => s.put(blob, id))) !== undefined;
  }

  async get(id: string): Promise<Blob | undefined> {
    const value = await this.run<Blob | undefined>('readonly', s => s.get(id));
    return value instanceof Blob ? value : undefined;
  }

  async has(id: string): Promise<boolean> {
    return (await this.run('readonly', s => s.count(id))) === 1;
  }

  async delete(id: string): Promise<void> {
    await this.run('readwrite', s => s.delete(id));
  }

  /** Downscales to maxSide px and re-encodes as JPEG. Returns the original if decoding fails. */
  async compress(file: Blob, maxSide = 1280, quality = 0.8): Promise<Blob> {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      return blob ?? file;
    } catch {
      return file;
    }
  }

  toDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  fromDataUrl(dataUrl: string): Blob | undefined {
    const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(dataUrl);
    if (!m) {
      return undefined;
    }
    try {
      const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
      return new Blob([bytes], { type: m[1] });
    } catch {
      return undefined;
    }
  }
}
