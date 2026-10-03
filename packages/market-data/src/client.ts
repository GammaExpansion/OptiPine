import type { RunInput } from '@pine/engine';
import { parseRunMetadata } from './csv.ts';
import {
  feedKey,
  validateFeedRequest,
  type Feed,
  type FeedDataset,
  type FeedRequest,
  type FeedSymbol,
} from './contracts.ts';
import { restoreError } from '@pine/messages';
import { marketDataError } from './messages.ts';

export interface FeedCache {
  get(key: string): Promise<FeedDataset | undefined>;
  put(key: string, dataset: FeedDataset): Promise<void>;
}
const TTL = 5 * 60_000;
const memory = new Map<string, FeedDataset>();
function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pine.market.v1', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('datasets', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}
async function cacheTransaction<T>(
  mode: IDBTransactionMode,
  operate: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  const db = await openCache();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('datasets', mode);
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      operate(tx.objectStore('datasets'), (value) => {
        result = value;
      });
    });
  } finally {
    db.close();
  }
}
export const browserFeedCache: FeedCache = {
  async get(key) {
    const saved = memory.get(key);
    if (saved && Date.now() - saved.fetchedAt < TTL) return structuredClone(saved);
    try {
      return await cacheTransaction<FeedDataset | undefined>('readonly', (store, done) => {
        const read = store.get(key);
        read.onsuccess = () =>
          done(
            read.result && Date.now() - read.result.data.fetchedAt < TTL
              ? read.result.data
              : undefined,
          );
      });
    } catch {
      return undefined;
    }
  },
  async put(key, data) {
    memory.delete(key);
    memory.set(key, structuredClone(data));
    while (memory.size > 4) memory.delete(memory.keys().next().value!);
    try {
      await cacheTransaction<void>('readwrite', (store, done) => {
        store.put({ key, data });
        const all = store.getAll();
        all.onsuccess = () => {
          const rows = all.result.sort((a, b) => b.data.fetchedAt - a.data.fetchedAt);
          for (const row of rows.slice(4)) store.delete(row.key);
          done();
        };
      });
    } catch {
      /* Private mode or quota errors must not prevent loading the fetched dataset. */
    }
  },
};

async function api(
  path: string,
  params: Record<string, string>,
  signal: AbortSignal,
  fetcher: typeof fetch,
): Promise<any> {
  let response: Response;
  try {
    response = await fetcher(`/api/market/${path}?${new URLSearchParams(params)}`, {
      signal,
      credentials: 'same-origin',
    });
  } catch (error) {
    signal.throwIfAborted();
    throw marketDataError('feedNetworkError');
  }
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw marketDataError('feedProxyMissing');
  const data = await response.json();
  if (!response.ok) {
    if (data?.error?.uiText) throw restoreError(data.error);
    throw marketDataError('feedHttpError', { status: response.status });
  }
  return data;
}
function validateDataset(data: FeedDataset, request: FeedRequest): FeedDataset {
  const profile = parseRunMetadata(data.input);
  if (
    profile.timeframe !== request.timeframe ||
    !Array.isArray(data.input.bars) ||
    !data.input.bars.length ||
    !Number.isFinite(data.fetchedAt)
  )
    throw marketDataError('feedInvalidResponse');
  let previous = -Infinity;
  for (const bar of data.input.bars) {
    if (
      !Number.isSafeInteger(bar.time) ||
      bar.time <= previous ||
      bar.time < request.from ||
      bar.time >= request.to ||
      ![bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) ||
      bar.volume < 0 ||
      bar.high < Math.max(bar.low, bar.open, bar.close) ||
      bar.low > Math.min(bar.high, bar.open, bar.close)
    )
      throw marketDataError('feedInvalidResponse');
    previous = bar.time;
  }
  return {
    ...data,
    input: { ...profile, bars: data.input.bars, realtimeTail: false, strategyClosePending: false },
  };
}
export class FeedClient {
  readonly #fetch: typeof fetch;
  readonly #cache: FeedCache;
  constructor(fetcher: typeof fetch = fetch, cache: FeedCache = browserFeedCache) {
    this.#fetch = fetcher;
    this.#cache = cache;
  }
  async search(feed: Feed, q: string, signal: AbortSignal): Promise<FeedSymbol[]> {
    const data = await api('search', { feed, q }, signal, this.#fetch);
    if (
      !Array.isArray(data.symbols) ||
      data.symbols.some((s: FeedSymbol) =>
        ['symbol', 'name', 'exchange', 'type'].some(
          (k) => typeof s[k as keyof FeedSymbol] !== 'string',
        ),
      )
    )
      throw marketDataError('feedInvalidResponse');
    return data.symbols;
  }
  async load(
    value: FeedRequest,
    signal: AbortSignal,
  ): Promise<{ dataset: FeedDataset; cached: boolean }> {
    const request = validateFeedRequest(value);
    const key = feedKey(request);
    const cached = await this.#cache.get(key);
    signal.throwIfAborted();
    if (cached) {
      try {
        return { dataset: validateDataset(cached, request), cached: true };
      } catch {
        /* A corrupted browser cache is replaced from the provider. */
      }
    }
    const data = await api(
      'bars',
      { ...request, from: String(request.from), to: String(request.to) },
      signal,
      this.#fetch,
    );
    signal.throwIfAborted();
    const dataset = validateDataset(data, request);
    await this.#cache.put(key, dataset);
    signal.throwIfAborted();
    return { dataset, cached: false };
  }
}

/** A changed selection, tab or closed dialog invalidates every late reply. */
export class FeedImportSession {
  result?: { dataset: FeedDataset; cached: boolean };
  pending = false;
  #version = 0;
  #controller?: AbortController;
  invalidate(): void {
    this.#version++;
    this.#controller?.abort();
    this.result = undefined;
    this.pending = false;
  }
  async load(request: FeedRequest, client: FeedClient): Promise<boolean> {
    this.invalidate();
    const version = this.#version;
    const controller = (this.#controller = new AbortController());
    this.pending = true;
    try {
      const result = await client.load(request, controller.signal);
      if (version !== this.#version) return false;
      this.result = result;
      return true;
    } catch (error) {
      if (version !== this.#version) return false;
      throw error;
    } finally {
      if (version === this.#version) this.pending = false;
    }
  }
  buildInput(current: RunInput): RunInput {
    if (this.pending || !this.result) throw marketDataError('importNotReady');
    return {
      ...current,
      ...this.result.dataset.input,
      sessionCalendar: this.result.dataset.input.sessionCalendar,
      realtimeTail: false,
      strategyClosePending: false,
    };
  }
}
