/** iPhone, iPad and iPadOS in desktop mode (which reports itself as a Mac with a touch screen). */
export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} МБ`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} ГБ`;
}

/** Files that must be in the cache for the app to open and to read PDFs without a connection. */
export const OFFLINE_ESSENTIALS = ['index.html', 'manifest.webmanifest', 'pdfjs/pdf.worker.min.mjs'];
