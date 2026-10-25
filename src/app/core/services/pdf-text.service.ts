import { Injectable } from '@angular/core';

import { TextChunk, chunksToLines } from '../utils/document-text';

// Полифил асинхронного итератора ReadableStream для Safari.
// Должен выполниться ДО загрузки pdfjs-dist, поэтому находится в самом верху модуля.
if (
  typeof ReadableStream !== 'undefined' &&
  !ReadableStream.prototype[Symbol.asyncIterator]
) {
  (ReadableStream.prototype as unknown as Record<symbol, unknown>)[
    Symbol.asyncIterator
  ] = async function* (this: ReadableStream) {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

export class DocumentError extends Error {
  constructor(
    message: string,
    readonly technical?: string,
  ) {
    super(message);
  }
}

const MAX_PAGES = 30;

/** Reads the text layer of a PDF in the browser with pdf.js (loaded only when a PDF is opened). */
@Injectable({ providedIn: 'root' })
export class PdfTextService {
  async extract(data: Uint8Array): Promise<{ text: string; pages: number }> {
    let pdfjs: typeof import('pdfjs-dist/legacy/build/pdf.mjs');
    try {
      pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    } catch (e) {
      throw new DocumentError(
        'Не удалось загрузить модуль чтения PDF. Возможно, при первом открытии PDF нет связи, либо браузер слишком старый. Можно вставить текст вручную.',
        describe(e),
      );
    }
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
    }

    let task;
    let doc;
    try {
      task = pdfjs.getDocument({ data: data.slice(), useSystemFonts: true });
      doc = await task.promise;
    } catch (e) {
      void task?.destroy();
      if ((e as { name?: string }).name === 'PasswordException') {
        throw new DocumentError(
          'PDF защищён паролем. Снимите защиту или вставьте текст вручную.',
        );
      }
      throw new DocumentError(
        'Не удалось открыть PDF. Файл повреждён, это не PDF, либо не загрузился файл pdfjs/pdf.worker.min.mjs.',
        describe(e),
      );
    }

    try {
      const pages: string[] = [];
      for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        const chunks: TextChunk[] = content.items.flatMap((item) =>
          'str' in item
            ? [
                {
                  str: item.str,
                  x: item.transform[4],
                  y: item.transform[5],
                  width: item.width,
                  height: item.height || Math.abs(item.transform[3]),
                },
              ]
            : [],
        );
        pages.push(chunksToLines(chunks).join('\n'));
      }
      return { text: pages.join('\n\n'), pages: doc.numPages };
    } catch (e) {
      throw new DocumentError(
        'Не удалось прочитать текст страницы PDF.',
        describe(e),
      );
    } finally {
      void task.destroy();
    }
  }
}

/** Short technical description of an error for the "details" block. */
export function describe(e: unknown): string {
  if (e instanceof Error) {
    const stack = (e.stack ?? '').split('\n').slice(0, 4).join('\n');
    return `${e.name}: ${e.message}${stack ? '\n' + stack : ''}`;
  }
  return String(e);
}
