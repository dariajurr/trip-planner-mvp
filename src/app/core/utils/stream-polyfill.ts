/**
 * Safari (before 18.x) has no async iteration for ReadableStream, which pdf.js relies on
 * (`for await (const chunk of stream)`). Without it PDF reading fails with a cryptic TypeError.
 * Installs the missing `Symbol.asyncIterator` and `values()`. Returns true when something was added.
 */
export function polyfillReadableStreamAsyncIterator(
  target: { prototype: object } | undefined = typeof ReadableStream !== 'undefined' ? ReadableStream : undefined,
): boolean {
  if (!target) return false;
  const proto = target.prototype as Record<PropertyKey, unknown>;
  if (typeof proto[Symbol.asyncIterator] === 'function') return false;

  async function* iterate(this: ReadableStream<unknown>): AsyncGenerator<unknown> {
    const reader = this.getReader();
    let finished = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          finished = true;
          return;
        }
        yield value;
      }
    } catch (error) {
      finished = true; // a failed read has already errored the stream
      throw error;
    } finally {
      // leaving the loop early (break/return) must cancel the stream, as the spec says
      if (!finished) await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }

  proto[Symbol.asyncIterator] = iterate;
  if (typeof proto['values'] !== 'function') proto['values'] = iterate;
  return true;
}
