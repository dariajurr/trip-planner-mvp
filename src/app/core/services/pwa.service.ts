import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

import { OFFLINE_ESSENTIALS, isIosDevice } from '../utils/pwa-utils';

export type OfflineState = 'checking' | 'preparing' | 'ready' | 'dev' | 'unsupported';
export type UpdateCheck = 'idle' | 'checking' | 'latest' | 'available' | 'error' | 'unavailable';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const UPDATE_EVERY_MS = 60 * 60 * 1000;
const RESUME_CHECK_GAP_MS = 10 * 60 * 1000;

/**
 * Everything about running as an installed, offline-capable app: connectivity, app updates,
 * the install prompt and protection of the stored data from being cleared by the browser.
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly sw = inject(SwUpdate);

  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  /** A new version was downloaded and waits for the user to restart the app. */
  readonly updateReady = signal(false);
  /** The service worker is in a broken state: only a reload helps. */
  readonly needsReload = signal(false);
  readonly updateCheck = signal<UpdateCheck>('idle');
  readonly offline = signal<OfflineState>('checking');
  readonly standalone = signal(this.detectStandalone());
  readonly installable = signal(false);
  readonly persisted = signal<boolean | null>(null);
  readonly storage = signal<{ usage: number; quota: number } | null>(null);

  readonly ios = typeof navigator !== 'undefined' && isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);

  private installEvent: InstallPromptEvent | null = null;
  private lastCheck = 0;

  constructor() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      this.installEvent = event as InstallPromptEvent;
      this.installable.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.installEvent = null;
      this.installable.set(false);
      this.standalone.set(true);
    });
    window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => this.standalone.set(this.detectStandalone()));

    if (this.sw.isEnabled) {
      this.sw.versionUpdates.subscribe(event => {
        if (event.type === 'VERSION_READY') this.updateReady.set(true);
      });
      this.sw.unrecoverable.subscribe(() => this.needsReload.set(true));

      setInterval(() => void this.checkForUpdate(false), UPDATE_EVERY_MS);
      // a phone app can stay in the background for days: look for a new version when it comes back
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - this.lastCheck > RESUME_CHECK_GAP_MS) {
          void this.checkForUpdate(false);
        }
      });
    }

    void this.refreshOfflineState();
    void this.refreshStorage();
  }

  /** Looks for a new version. `report` = update the visible status (user pressed the button). */
  async checkForUpdate(report = true): Promise<void> {
    if (!this.sw.isEnabled) {
      if (report) this.updateCheck.set('unavailable');
      return;
    }
    if (!navigator.onLine) {
      if (report) this.updateCheck.set('error');
      return;
    }
    this.lastCheck = Date.now();
    if (report) this.updateCheck.set('checking');
    try {
      const found = await this.sw.checkForUpdate();
      if (report) this.updateCheck.set(found || this.updateReady() ? 'available' : 'latest');
    } catch {
      if (report) this.updateCheck.set('error');
    }
  }

  async applyUpdate(): Promise<void> {
    try {
      await this.sw.activateUpdate();
    } finally {
      location.reload();
    }
  }

  async promptInstall(): Promise<void> {
    const event = this.installEvent;
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') this.installable.set(false);
    this.installEvent = null;
  }

  /** Asks the browser not to clear the app's data when the device runs low on space or the app is unused. */
  async requestPersistence(): Promise<boolean> {
    try {
      const granted = (await navigator.storage?.persist?.()) ?? false;
      this.persisted.set(granted);
      return granted;
    } catch {
      return false;
    }
  }

  async refreshStorage(): Promise<void> {
    try {
      this.persisted.set((await navigator.storage?.persisted?.()) ?? null);
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.quota) this.storage.set({ usage: estimate.usage ?? 0, quota: estimate.quota });
    } catch {
      // not supported: the card simply shows nothing
    }
  }

  /**
   * "Ready" = the page is controlled by the service worker and the cache holds the app shell
   * and the PDF worker. Checked again every few seconds while the first download is in progress.
   */
  async refreshOfflineState(attempt = 0): Promise<void> {
    if (!('serviceWorker' in navigator) || typeof caches === 'undefined') {
      this.offline.set('unsupported');
      return;
    }
    if (!this.sw.isEnabled) {
      this.offline.set('dev');
      return;
    }
    const controlled = !!navigator.serviceWorker.controller;
    const hits = await Promise.all(OFFLINE_ESSENTIALS.map(path => caches.match(new URL(path, document.baseURI).href).catch(() => undefined)));
    if (controlled && hits.every(Boolean)) {
      this.offline.set('ready');
      return;
    }
    this.offline.set('preparing');
    if (attempt < 40) setTimeout(() => void this.refreshOfflineState(attempt + 1), 3000);
  }

  private detectStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  }
}
