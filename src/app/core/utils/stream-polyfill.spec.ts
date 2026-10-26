import { polyfillReadableStreamAsyncIterator } from './stream-polyfill';

/** A minimal stream: enough surface for the polyfill, with a record of cancellation and unlocking. */
class FakeStream {
  cancelled = false;
  locked = false;
  failAt = -1;
  constructor(private readonly items: unknown[]) {}
  getReader() {
    let i = 0;
    this.locked = true;
    return {
      read: async () => {
        if (i === this.failAt) throw new Error('read failed');
        return i < this.items.length ? { done: false, value: this.items[i++] } : { done: true, value: undefined };
      },
      cancel: async () => {
        this.cancelled = true;
      },
      releaseLock: () => {
        this.locked = false;
      },
    };
  }
}

describe('polyfillReadableStreamAsyncIterator', () => {
  const install = () => {
    polyfillReadableStreamAsyncIterator(FakeStream);
    return FakeStream.prototype as unknown as { [Symbol.asyncIterator]: () => AsyncGenerator<unknown> };
  };
  afterEach(() => {
    delete (FakeStream.prototype as unknown as Record<PropertyKey, unknown>)[Symbol.asyncIterator];
    delete (FakeStream.prototype as unknown as Record<PropertyKey, unknown>)['values'];
  });

  it('adds async iteration where it is missing and reads every chunk', async () => {
    expect(install()[Symbol.asyncIterator]).toBeDefined();
    const seen: unknown[] = [];
    for await (const chunk of new FakeStream([1, 2, 3]) as unknown as AsyncIterable<unknown>) seen.push(chunk);
    expect(seen).toEqual([1, 2, 3]);
  });

  it('unlocks the stream when it ends normally, without cancelling it', async () => {
    install();
    const stream = new FakeStream(['a']);
    for await (const _ of stream as unknown as AsyncIterable<unknown>) void _;
    expect(stream.locked).toBe(false);
    expect(stream.cancelled).toBe(false);
  });

  it('cancels the stream when the loop is left early', async () => {
    install();
    const stream = new FakeStream([1, 2, 3]);
    for await (const _ of stream as unknown as AsyncIterable<unknown>) {
      void _;
      break;
    }
    expect(stream.cancelled).toBe(true);
    expect(stream.locked).toBe(false);
  });

  it('passes read errors on and still unlocks', async () => {
    install();
    const stream = new FakeStream([1, 2, 3]);
    stream.failAt = 1;
    await expectAsync((async () => { for await (const _ of stream as unknown as AsyncIterable<unknown>) void _; })()).toBeRejectedWithError('read failed');
    expect(stream.locked).toBe(false);
    expect(stream.cancelled).toBe(false);
  });

  it('does nothing when the browser already supports it, and without a target', () => {
    expect(polyfillReadableStreamAsyncIterator(undefined)).toBe(false);
    class Native { async *[Symbol.asyncIterator]() { yield 1; } }
    const before = Native.prototype[Symbol.asyncIterator];
    expect(polyfillReadableStreamAsyncIterator(Native)).toBe(false);
    expect(Native.prototype[Symbol.asyncIterator]).toBe(before);
  });

  it('also works on a real ReadableStream with the native iterator removed', async () => {
    const proto = ReadableStream.prototype as unknown as Record<PropertyKey, unknown>;
    const native = Object.getOwnPropertyDescriptor(proto, Symbol.asyncIterator);
    const nativeValues = Object.getOwnPropertyDescriptor(proto, 'values');
    delete proto[Symbol.asyncIterator];
    delete proto['values'];
    try {
      expect(polyfillReadableStreamAsyncIterator()).toBe(true);
      const stream = new ReadableStream({ start(c) { c.enqueue('x'); c.enqueue('y'); c.close(); } });
      const seen: unknown[] = [];
      for await (const chunk of stream as unknown as AsyncIterable<unknown>) seen.push(chunk);
      expect(seen).toEqual(['x', 'y']);
    } finally {
      delete proto[Symbol.asyncIterator];
      delete proto['values'];
      if (native) Object.defineProperty(proto, Symbol.asyncIterator, native);
      if (nativeValues) Object.defineProperty(proto, 'values', nativeValues);
    }
  });
});
