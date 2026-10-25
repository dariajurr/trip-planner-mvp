import { Injectable, inject } from '@angular/core';

import { BookingDraft, ParseOptions, parseBookingText } from '../utils/booking-parser';
import { icsToDrafts, mergeDrafts, parseEml, parseIcs } from '../utils/document-text';
import { DocumentError, PdfTextService, describe } from './pdf-text.service';

export interface ImportedDocument {
  file: File;
  /** The text the drafts were parsed from; shown on demand so a failed parse can be diagnosed. */
  text: string;
  drafts: BookingDraft[];
  /** Why nothing could be read, if so. */
  error?: string;
  /** Technical details of an unexpected failure (for a bug report). */
  details?: string;
}

const MAX_BYTES = 20 * 1024 * 1024;
const ext = (name: string) => name.toLowerCase().split('.').pop() ?? '';

/** Turns an uploaded file or pasted text into booking drafts. Everything happens on the device. */
@Injectable({ providedIn: 'root' })
export class BookingImportService {
  private readonly pdf = inject(PdfTextService);

  async readFile(file: File, opts: ParseOptions): Promise<ImportedDocument> {
    const result: ImportedDocument = { file, text: '', drafts: [] };

    if (file.size > MAX_BYTES) {
      return { ...result, error: 'Файл больше 20 МБ.' };
    }
    const type = file.type.toLowerCase();
    const kind = ext(file.name);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parts: { text: string; drafts: BookingDraft[] }[] = [];

      if (type === 'application/pdf' || kind === 'pdf') {
        const { text } = await this.pdf.extract(bytes);
        if (!text.trim()) throw new DocumentError('В PDF нет текста (похоже на скан или картинку). Вставьте текст вручную или введите данные руками.');
        parts.push({ text, drafts: parseBookingText(text, opts) });
      } else if (kind === 'eml' || type === 'message/rfc822') {
        parts.push(...(await this.readEmail(bytes, opts)));
      } else if (kind === 'ics' || type === 'text/calendar') {
        const text = new TextDecoder().decode(bytes);
        parts.push({ text, drafts: icsToDrafts(parseIcs(text), opts) });
      } else if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'heic', 'webp', 'gif'].includes(kind)) {
        throw new DocumentError('Картинки пока не распознаются. Откройте скриншот, скопируйте текст и вставьте его, либо введите данные руками.');
      } else {
        const raw = new TextDecoder().decode(bytes);
        const text = kind === 'html' || kind === 'htm' || type === 'text/html' ? (await import('../utils/document-text')).htmlToText(raw) : raw;
        parts.push({ text, drafts: parseBookingText(text, opts) });
      }

      result.text = parts.map(p => p.text).join('\n\n----\n\n');
      result.drafts = mergeDrafts(parts.flatMap(p => p.drafts));
      if (!result.drafts.length) {
        result.error = 'Рейсы и проживание в документе не найдены. Проверьте распознанный текст ниже или добавьте данные вручную.';
      }
    } catch (e) {
      // expected situations (a scan, a password-protected PDF) are explained on screen; only real failures are logged
      if (!(e instanceof DocumentError) || e.technical) console.error('[bookings] failed to read', file.name, e);
      const info = `file: ${file.name}, ${file.size} B, type "${file.type}"\nbrowser: ${navigator.userAgent}`;
      if (e instanceof DocumentError) {
        result.error = e.message;
        if (e.technical) result.details = `${e.technical}\n${info}`;
      } else {
        const name = e instanceof Error ? e.name : 'Error';
        const message = e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120);
        result.error = `Не удалось прочитать файл (${name}: ${message}).`;
        result.details = `${describe(e)}\n${info}`;
      }
    }
    return result;
  }

  readText(text: string, opts: ParseOptions): Pick<ImportedDocument, 'text' | 'drafts' | 'error'> {
    const drafts = mergeDrafts(parseBookingText(text, opts));
    return {
      text,
      drafts,
      error: drafts.length ? undefined : 'В тексте рейсы и проживание не найдены. Добавьте данные вручную.',
    };
  }

  /** Mail body, PDF attachments and calendar attachments are all read. */
  private async readEmail(bytes: Uint8Array, opts: ParseOptions): Promise<{ text: string; drafts: BookingDraft[] }[]> {
    const mail = parseEml(bytes);
    const parts = [{ text: `${mail.subject}\n${mail.text}`, drafts: parseBookingText(`${mail.subject}\n${mail.text}`, opts) }];

    for (const a of mail.attachments) {
      try {
        if (a.mime === 'application/pdf' || a.name.toLowerCase().endsWith('.pdf')) {
          const { text } = await this.pdf.extract(a.data);
          if (text.trim()) parts.push({ text, drafts: parseBookingText(text, opts) });
        } else if (a.mime === 'text/calendar' || a.name.toLowerCase().endsWith('.ics')) {
          const text = new TextDecoder().decode(a.data);
          parts.push({ text, drafts: icsToDrafts(parseIcs(text), opts) });
        }
      } catch {
        // an unreadable attachment must not hide what the mail body says
      }
    }
    return parts;
  }
}
