import type { State } from './ta.ts';
import type { Scope } from './scope.ts';

function stateCheckpoint(state: State): () => void {
  const saved = { ...state };
  const rolling = state.rolling?.clone();
  const sampleCount = state.samples.length;
  const matchCount = state.matches?.length;
  const children = new Map([...state.nested].map(([key, child]) => [key, stateCheckpoint(child)]));
  return () => {
    for (const key of Object.keys(state) as (keyof State)[]) delete state[key];
    Object.assign(state, saved);
    if (rolling) state.rolling = rolling.clone();
    state.samples.length = sampleCount;
    if (state.matches && matchCount !== undefined) state.matches.length = matchCount;
    for (const key of state.nested.keys()) if (!children.has(key)) state.nested.delete(key);
    children.forEach((restore) => restore());
  };
}

/** Histories only append during execution, so checkpoint lengths avoid copying past bars. */
export function checkpoint(
  root: Scope,
  scopes: Map<string, Scope>,
  states: Map<string, State>,
): () => void {
  const savedScopes = new Map(
    [root, ...scopes.values()].map((scope) => [scope, scope.checkpoint()]),
  );
  const savedStates = new Map([...states].map(([key, state]) => [key, stateCheckpoint(state)]));
  return () => {
    for (const scope of [root, ...scopes.values()]) {
      const restore = savedScopes.get(scope);
      if (restore) restore();
      else scope.discardTransient();
    }
    for (const key of states.keys()) if (!savedStates.has(key)) states.delete(key);
    savedStates.forEach((restore) => restore());
  };
}

/** Records only mutated containers, retaining object identity across a script rollback. */
export class MutationJournal {
  private snapshots = new Map<object, () => void>();
  private persistent = new WeakSet<object>();

  retain(value: unknown): void {
    if (!value || typeof value !== 'object' || this.persistent.has(value)) return;
    this.persistent.add(value);
    const children =
      value instanceof Map ? [...value.keys(), ...value.values()] : Object.values(value);
    children.forEach((child) => this.retain(child));
  }

  capture(value: unknown): void {
    if (
      !value ||
      typeof value !== 'object' ||
      this.persistent.has(value) ||
      this.snapshots.has(value)
    )
      return;
    if (value instanceof Map) {
      const entries = [...value.entries()];
      this.snapshots.set(value, () => {
        value.clear();
        entries.forEach(([key, child]) => value.set(key, child));
      });
    } else if (Array.isArray(value)) {
      const elements = [...value];
      this.snapshots.set(value, () => {
        value.length = elements.length;
        elements.forEach((child, i) => {
          value[i] = child;
        });
      });
    } else {
      const record = value as Record<string, unknown>;
      const entries = { ...record };
      this.snapshots.set(value, () => {
        Object.keys(record).forEach((key) => {
          delete record[key];
        });
        Object.assign(record, entries);
      });
    }
  }

  restore(): void {
    for (const restore of this.snapshots.values()) restore();
    this.snapshots.clear();
  }
}
