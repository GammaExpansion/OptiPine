import type { Feed, FeedClient, FeedSymbol } from '@pine/market-data';
import { errorText, type Text } from '@pine/messages';
import { createStore, type Observable } from './store.ts';

export interface SymbolSearchState {
  readonly results: readonly FeedSymbol[];
  readonly loading: boolean;
  readonly failure: Text | null;
}

/** Only the latest query may publish; closing suggestions also cancels the debounce and request. */
export class SymbolSearchSession implements Observable<SymbolSearchState> {
  readonly #client: Pick<FeedClient, 'search'>;
  readonly #store = createStore<SymbolSearchState>({ results: [], loading: false, failure: null });
  #controller: AbortController | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(client: Pick<FeedClient, 'search'>) {
    this.#client = client;
  }

  getState(): SymbolSearchState {
    return this.#store.getState();
  }

  subscribe(listener: (state: SymbolSearchState) => void): () => void {
    return this.#store.subscribe(listener);
  }

  search(feed: Feed, value: string, enabled = true): void {
    this.cancel();
    const query = value.trim();
    if (!enabled || !query) return;
    const controller = new AbortController();
    this.#controller = controller;
    this.#store.setState({ results: [], loading: true, failure: null });
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.#search(feed, query, controller.signal);
    }, 180);
  }

  async #search(feed: Feed, query: string, signal: AbortSignal): Promise<void> {
    try {
      const results = await this.#client.search(feed, query, signal);
      if (!signal.aborted) this.#store.setState({ results, loading: false, failure: null });
    } catch (error) {
      if (!signal.aborted)
        this.#store.setState({ results: [], loading: false, failure: errorText(error) });
    }
  }

  /** Keep the last error visible after blur, as the dialog's closed search field does. */
  cancel(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#controller?.abort();
    this.#controller = null;
    this.#store.setState({ ...this.getState(), results: [], loading: false });
  }

  /** A newly mounted search field starts without the previous dialog's error. */
  reset(): void {
    this.cancel();
    this.#store.setState({ results: [], loading: false, failure: null });
  }
}
