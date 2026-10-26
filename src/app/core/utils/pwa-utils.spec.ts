import { OFFLINE_ESSENTIALS, formatBytes, isIosDevice } from './pwa-utils';

describe('isIosDevice', () => {
  it('recognises iPhone, iPad and iPadOS pretending to be a Mac', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)', 'iPhone', 5)).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)', 'iPad', 5)).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true);
  });

  it('does not mistake a real Mac or Android for iOS', () => {
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false);
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Linux armv8l', 5)).toBe(false);
  });
});

describe('formatBytes', () => {
  it('uses readable units', () => {
    expect(formatBytes(512)).toBe('1 КБ');
    expect(formatBytes(150 * 1024)).toBe('150 КБ');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.5 МБ');
    expect(formatBytes(48 * 1024 * 1024)).toBe('48 МБ');
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.0 ГБ');
  });

  it('survives nonsense', () => {
    expect(formatBytes(NaN)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('OFFLINE_ESSENTIALS', () => {
  it('includes the app shell and the pdf.js worker', () => {
    expect(OFFLINE_ESSENTIALS).toContain('index.html');
    expect(OFFLINE_ESSENTIALS).toContain('pdfjs/pdf.worker.min.mjs');
  });
});
