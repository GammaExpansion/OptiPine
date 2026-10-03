/** A value that changes over time; a Zustand store or a component reads it through these two. */
export interface Observable<T> {
  getState(): T;
  /** Calls `listener` after every change; the returned function unsubscribes. */
  subscribe(listener: (state: T) => void): () => void;
}

export interface Store<T> extends Observable<T> {
  setState(state: T): void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<(state: T) => void>();
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setState(next) {
      if (next === state) return;
      state = next;
      for (const listener of [...listeners]) listener(state);
    },
  };
}
