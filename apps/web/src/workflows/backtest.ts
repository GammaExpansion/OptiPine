import type { Diagnostic, LiteralValue, RunInput, ScriptDescription } from '@pine/engine';
import type { FeedDataset } from '@pine/market-data';
import { errorText, type Message, type Text } from '@pine/messages';
import { metricValue, type TrialResult } from '@pine/optimizer';
import { WorkerCancelledError, WorkerStaleError } from '@pine/workers';
import {
  inputFields,
  inputValues,
  resetInputValues,
  setInputValue,
  type InputField,
} from './inputs.ts';
import { workflowMessage } from './messages.ts';
import {
  keepPropertyOverrides,
  propertyFields,
  propertyIds,
  propertyLabel,
  propertySettings,
  scriptProperties,
  setPropertyOverride,
  type PropertyField,
  type PropertyId,
  type PropertyOverrides,
  type PropertyValues,
  type ScriptProperties,
} from './properties.ts';
import { createStore, type Observable, type Store } from './store.ts';

/** The parts of `EngineWorkerClient` the session uses, so tests can pass a fake. */
export interface EngineClient {
  readonly sourceRevision: number;
  /** Raising the revision rejects pending work with `WorkerStaleError`. */
  setSourceRevision(sourceRevision: number): void;
  describe(source: string, sourceRevision?: number): Promise<ScriptDescription>;
  /** The Worker runs `runWithEquity`, so the result carries plots, trades, metrics and equity. */
  run(source: string, input: RunInput, sourceRevision?: number): Promise<TrialResult>;
  /** Rejects pending work with `WorkerCancelledError`. */
  cancel(): void;
}

/** Bars and symbol data for a run, as a provider fetch or a CSV import delivers them. */
export type DatasetInput = FeedDataset['input'];

/** The session's dataset; `revision` changes whenever the data does. */
export interface Dataset {
  readonly revision: number;
  readonly input: DatasetInput;
}

export type CompileState =
  | { readonly status: 'empty' }
  | { readonly status: 'compiling'; readonly startedAt: number }
  | {
      readonly status: 'compiled';
      readonly description: ScriptDescription;
      readonly durationMs: number;
    }
  | {
      readonly status: 'failed';
      /** Compiler diagnostics; kind `unsupported` is missing engine support, not a script error. */
      readonly diagnostics: readonly Diagnostic[];
      /** Set when the Worker failed rather than the compiler. */
      readonly error: Text | null;
    };

export interface RunFailure {
  /** Engine diagnostics with their line; empty when the Worker failed. */
  readonly diagnostics: readonly Diagnostic[];
  /** The bar the run stopped at, once the engine reports it on its diagnostic. */
  readonly bar: number | null;
  /** Set when the Worker failed rather than the script, for example after a crash. */
  readonly error: Text | null;
}

/** A run is complete or absent: a failed or cancelled run leaves the previous result as it was. */
export type RunState =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly startedAt: number }
  | { readonly status: 'done'; readonly startedAt: number; readonly finishedAt: number }
  | {
      readonly status: 'failed';
      readonly startedAt: number;
      readonly finishedAt: number;
      readonly failure: RunFailure;
    }
  | {
      readonly status: 'cancelled';
      readonly startedAt: number;
      readonly finishedAt: number;
      /** `source`: editing the script discarded the run. */
      readonly cause: 'user' | 'source';
    };

/** Exactly what a result was computed with. */
export interface RunSnapshot {
  readonly source: string;
  readonly sourceRevision: number;
  /** Every editable input's value, keyed by title. */
  readonly inputs: Readonly<Record<string, LiteralValue>>;
  readonly properties: PropertyOverrides;
  readonly dataset: Dataset;
}

export interface BacktestResult {
  readonly computedWith: RunSnapshot;
  /** Plots with `overlay`, trades, metrics, warnings, and one equity value per bar. */
  readonly output: TrialResult;
  /** The report's initial capital; null for an indicator, which has no account. */
  readonly initialCapital: number | null;
  readonly durationMs: number;
  readonly finishedAt: number;
}

export type OutdatedReason = 'source' | 'inputs' | 'properties' | 'data';

/** An input whose current value differs from the one the result used (B9). */
export interface InputChange {
  readonly title: string;
  /** Undefined when the input did not exist for the result. */
  readonly computed: LiteralValue | undefined;
  /** Undefined when the input no longer exists. */
  readonly current: LiteralValue | undefined;
}

export interface Outdated {
  /** Empty while the result matches the current settings. */
  readonly reasons: readonly OutdatedReason[];
  readonly inputs: readonly InputChange[];
}

export interface Readiness {
  readonly ok: boolean;
  /** Why the run action is disabled, most fundamental first. */
  readonly reasons: readonly Message[];
}

export interface BacktestState {
  readonly source: string;
  readonly sourceRevision: number;
  readonly compile: CompileState;
  /**
   * The last successful compile: inputs and properties keep coming from it while a newer one
   * fails (B10).
   */
  readonly description: ScriptDescription | null;
  readonly inputs: readonly InputField[];
  readonly scriptProperties: ScriptProperties | null;
  readonly propertyOverrides: PropertyOverrides;
  readonly properties: readonly PropertyField[];
  readonly dataset: Dataset | null;
  readonly run: RunState;
  /** The latest complete result; kept through later failures and cancellations. */
  readonly result: BacktestResult | null;
  /** Null without a result. */
  readonly outdated: Outdated | null;
  readonly readiness: Readiness;
}

type BaseState = Omit<BacktestState, 'properties' | 'outdated' | 'readiness'>;

const sameProperties = (a: PropertyOverrides, b: PropertyOverrides): boolean =>
  propertyIds.every((id) => Object.is(a[id], b[id]));

function outdatedOf(state: BaseState): Outdated | null {
  const result = state.result;
  if (!result) return null;
  const was = result.computedWith;
  const current = inputValues(state.inputs);
  const titles = new Set([...Object.keys(was.inputs), ...Object.keys(current)]);
  const inputs: InputChange[] = [];
  for (const title of titles) {
    const computed = Object.hasOwn(was.inputs, title) ? was.inputs[title] : undefined;
    const now = Object.hasOwn(current, title) ? current[title] : undefined;
    if (!Object.is(computed, now)) inputs.push({ title, computed, current: now });
  }
  const reasons: OutdatedReason[] = [];
  if (was.source !== state.source) reasons.push('source');
  if (inputs.length) reasons.push('inputs');
  if (!sameProperties(was.properties, state.propertyOverrides)) reasons.push('properties');
  if (was.dataset.revision !== state.dataset?.revision) reasons.push('data');
  return { reasons, inputs };
}

function readinessOf(state: BaseState, properties: readonly PropertyField[]): Readiness {
  const reasons: Message[] = [];
  if (!state.source.trim()) reasons.push(workflowMessage('backtest.noScript'));
  else if (state.compile.status === 'compiling')
    reasons.push(workflowMessage('backtest.compiling'));
  else if (state.compile.status === 'failed')
    reasons.push(workflowMessage('backtest.compileFailed'));
  if (!state.dataset) reasons.push(workflowMessage('backtest.noData'));
  for (const item of state.inputs)
    if (item.error)
      reasons.push(workflowMessage('backtest.inputInvalid', { title: item.descriptor.title }));
  for (const field of properties)
    if (field.error)
      reasons.push(
        workflowMessage('backtest.propertyInvalid', { property: propertyLabel(field.id) }),
      );
  if (state.run.status === 'running') reasons.push(workflowMessage('backtest.running'));
  return { ok: reasons.length === 0, reasons };
}

function derive(state: BaseState): BacktestState {
  const properties = state.scriptProperties
    ? propertyFields(state.scriptProperties, state.propertyOverrides)
    : [];
  return {
    ...state,
    properties,
    outdated: outdatedOf(state),
    readiness: readinessOf(state, properties),
  };
}

/**
 * The engine's `Diagnostic` has no bar yet; B11 needs it. Once the engine adds `bar` to the
 * diagnostic that ends a run, this reads it without further changes here.
 */
function failedBar(diagnostic: Diagnostic | undefined): number | null {
  const bar = (diagnostic as { bar?: unknown } | undefined)?.bar;
  return typeof bar === 'number' && Number.isSafeInteger(bar) ? bar : null;
}

export interface BacktestSessionOptions {
  /** Milliseconds since the epoch; `Date.now` unless a test fixes the clock. */
  now?: () => number;
}

/**
 * One Backtest page: the script and its compile, input values, property overrides, the dataset,
 * and the latest run (WEB.md 3.1). Every change produces a new state object.
 */
export class BacktestSession implements Observable<BacktestState> {
  readonly #client: EngineClient;
  readonly #now: () => number;
  readonly #store: Store<BacktestState>;
  #runToken = 0;
  #datasetRevision = 0;

  constructor(client: EngineClient, options: BacktestSessionOptions = {}) {
    this.#client = client;
    this.#now = options.now ?? Date.now;
    this.#store = createStore(
      derive({
        source: '',
        sourceRevision: client.sourceRevision,
        compile: { status: 'empty' },
        description: null,
        inputs: [],
        scriptProperties: null,
        propertyOverrides: {},
        dataset: null,
        run: { status: 'idle' },
        result: null,
      }),
    );
  }

  getState(): BacktestState {
    return this.#store.getState();
  }

  subscribe(listener: (state: BacktestState) => void): () => void {
    return this.#store.subscribe(listener);
  }

  #update(change: Partial<BaseState>): void {
    this.#store.setState(derive({ ...this.getState(), ...change }));
  }

  /** Replace the script and recompile it; a run in progress is discarded with the old source. */
  setSource(source: string): void {
    const state = this.getState();
    if (source === state.source) return;
    const sourceRevision = state.sourceRevision + 1;
    const now = this.#now();
    let run = state.run;
    if (run.status === 'running') {
      this.#runToken++;
      run = { status: 'cancelled', startedAt: run.startedAt, finishedAt: now, cause: 'source' };
    }
    this.#client.setSourceRevision(sourceRevision);
    if (!source.trim()) {
      this.#update({
        source,
        sourceRevision,
        compile: { status: 'empty' },
        description: null,
        inputs: [],
        scriptProperties: null,
        run,
      });
      return;
    }
    this.#update({ source, sourceRevision, compile: { status: 'compiling', startedAt: now }, run });
    void this.#compile(source, sourceRevision, now);
  }

  async #compile(source: string, sourceRevision: number, startedAt: number): Promise<void> {
    let description: ScriptDescription;
    try {
      description = await this.#client.describe(source, sourceRevision);
    } catch (error) {
      if (sourceRevision !== this.getState().sourceRevision || error instanceof WorkerStaleError)
        return;
      this.#update({ compile: { status: 'failed', diagnostics: [], error: errorText(error) } });
      return;
    }
    const state = this.getState();
    if (sourceRevision !== state.sourceRevision) return;
    if (!description.success) {
      this.#update({
        compile: { status: 'failed', diagnostics: description.diagnostics, error: null },
      });
      return;
    }
    const script = scriptProperties(description);
    this.#update({
      compile: { status: 'compiled', description, durationMs: this.#now() - startedAt },
      description,
      inputs: inputFields(description.inputs, state.inputs),
      scriptProperties: script,
      propertyOverrides: keepPropertyOverrides(script, state.propertyOverrides),
    });
  }

  setInput(title: string, value: LiteralValue): void {
    this.#update({ inputs: setInputValue(this.getState().inputs, title, value) });
  }

  resetInputs(): void {
    this.#update({ inputs: resetInputValues(this.getState().inputs) });
  }

  /** B9: put back the input values the current result was computed with. */
  restoreResultInputs(): void {
    const { result } = this.getState();
    if (!result) return;
    let inputs = this.getState().inputs;
    for (const [title, value] of Object.entries(result.computedWith.inputs))
      inputs = setInputValue(inputs, title, value);
    this.#update({ inputs });
  }

  /** Override one strategy property; ignored until a compile has supplied the script's values. */
  setProperty<K extends PropertyId>(id: K, value: PropertyValues[K]): void {
    const { scriptProperties: script, propertyOverrides } = this.getState();
    if (!script) return;
    this.#update({ propertyOverrides: setPropertyOverride(script, propertyOverrides, id, value) });
  }

  resetProperties(): void {
    this.#update({ propertyOverrides: {} });
  }

  /** Make `input` the data for the next run; an existing result is then outdated. */
  setDataset(input: DatasetInput): void {
    this.#update({ dataset: { revision: ++this.#datasetRevision, input } });
  }

  /** Start a backtest with the current settings; does nothing unless `readiness.ok`. */
  async run(): Promise<void> {
    const state = this.getState();
    if (!state.readiness.ok || !state.dataset) return;
    const snapshot: RunSnapshot = {
      source: state.source,
      sourceRevision: state.sourceRevision,
      inputs: inputValues(state.inputs),
      properties: state.propertyOverrides,
      dataset: state.dataset,
    };
    const input: RunInput = {
      ...snapshot.dataset.input,
      inputs: snapshot.inputs,
      settings: propertySettings(snapshot.properties),
    };
    const token = ++this.#runToken;
    const startedAt = this.#now();
    this.#update({ run: { status: 'running', startedAt } });
    let output: TrialResult;
    try {
      output = await this.#client.run(snapshot.source, input, snapshot.sourceRevision);
    } catch (error) {
      if (token !== this.#runToken) return;
      const finishedAt = this.#now();
      if (error instanceof WorkerCancelledError || error instanceof WorkerStaleError)
        this.#update({
          run: {
            status: 'cancelled',
            startedAt,
            finishedAt,
            cause: error instanceof WorkerStaleError ? 'source' : 'user',
          },
        });
      else
        this.#update({
          run: {
            status: 'failed',
            startedAt,
            finishedAt,
            failure: { diagnostics: [], bar: null, error: errorText(error) },
          },
        });
      return;
    }
    if (token !== this.#runToken) return;
    const finishedAt = this.#now();
    if (output.diagnostics.length) {
      this.#update({
        run: {
          status: 'failed',
          startedAt,
          finishedAt,
          failure: {
            diagnostics: output.diagnostics,
            bar: failedBar(output.diagnostics[0]),
            error: null,
          },
        },
      });
      return;
    }
    this.#update({
      run: { status: 'done', startedAt, finishedAt },
      result: {
        computedWith: snapshot,
        output,
        initialCapital: metricValue(output.metrics, 'Initial capital'),
        durationMs: finishedAt - startedAt,
        finishedAt,
      },
    });
  }

  /** Stop the running backtest; the previous result stays. */
  cancel(): void {
    const { run } = this.getState();
    if (run.status !== 'running') return;
    this.#runToken++;
    this.#client.cancel();
    this.#update({
      run: {
        status: 'cancelled',
        startedAt: run.startedAt,
        finishedAt: this.#now(),
        cause: 'user',
      },
    });
  }
}

export type IssueCategory =
  | 'compileError'
  | 'unsupported'
  | 'runtimeError'
  | 'limit'
  | 'engineFault'
  | 'workerError'
  | 'ignoredEffect';

/** One row of the Issues tab. */
export interface Issue {
  readonly category: IssueCategory;
  readonly line: number | null;
  readonly column: number | null;
  readonly bar: number | null;
  /** The engine's diagnostic or warning text, or a Worker error's message. */
  readonly text: Text;
}

function runCategory(kind: Diagnostic['kind']): IssueCategory {
  return kind === 'unsupported'
    ? 'unsupported'
    : kind === 'limit'
      ? 'limit'
      : kind === 'internal'
        ? 'engineFault'
        : 'runtimeError';
}

/**
 * The Issues tab: the failed compile's errors, the failed run's diagnostics, and the effects the
 * displayed result ignored. An unsupported feature has its own category: missing engine support,
 * not a fault in the script.
 */
export function backtestIssues(state: BacktestState): Issue[] {
  const issues: Issue[] = [];
  const workerIssue = (text: Text): Issue => ({
    category: 'workerError',
    line: null,
    column: null,
    bar: null,
    text,
  });
  if (state.compile.status === 'failed') {
    for (const diagnostic of state.compile.diagnostics)
      issues.push({
        category: diagnostic.kind === 'unsupported' ? 'unsupported' : 'compileError',
        line: diagnostic.line,
        column: diagnostic.column ?? null,
        bar: null,
        text: diagnostic.message,
      });
    if (state.compile.error !== null) issues.push(workerIssue(state.compile.error));
  }
  if (state.run.status === 'failed') {
    const { diagnostics, bar, error } = state.run.failure;
    diagnostics.forEach((diagnostic, index) =>
      issues.push({
        category: runCategory(diagnostic.kind),
        line: diagnostic.line,
        column: diagnostic.column ?? null,
        bar: index === 0 ? bar : null,
        text: diagnostic.message,
      }),
    );
    if (error !== null) issues.push(workerIssue(error));
  }
  for (const warning of state.result?.output.warnings ?? [])
    issues.push({
      category: 'ignoredEffect',
      line: warning.line,
      column: null,
      bar: null,
      text: warning.message,
    });
  return issues;
}
