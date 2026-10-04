import type { Diagnostic, LiteralValue, RunInput, ScriptDescription } from '@pine/engine';
import type { FeedDataset } from '@pine/market-data';
import { errorText, type Message, type Text } from '@pine/messages';
import { metricValue, type TrialResult } from '@pine/optimizer';
import { WorkerCancelledError, WorkerStaleError } from '@pine/workers';
import {
  applyInputValues,
  inputFields,
  inputValues,
  resetInputValues,
  setInputValue,
  type InputField,
  type ParameterOrigin,
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

/** One value of a previewed set that differs from the current input (the B16 banner). */
export interface PreviewChange {
  readonly title: string;
  /** Undefined when the current inputs have no value for it. */
  readonly current: LiteralValue | undefined;
  readonly preview: LiteralValue;
}

/**
 * A parameter set run on the Backtest page without changing the current inputs (B16). While it is
 * open, the page shows its run and result; the current inputs, run and result stay as they were.
 */
export interface Preview {
  /** The set as the optimization ran it: every input it overrode, keyed by title. */
  readonly set: Readonly<Record<string, LiteralValue>>;
  readonly origin: ParameterOrigin;
  /** The inputs the preview runs: the current inputs with the set written in. */
  readonly inputs: readonly InputField[];
  /** The set's values that differ from the current inputs, in declaration order. */
  readonly changes: readonly PreviewChange[];
  readonly run: RunState;
  readonly result: BacktestResult | null;
  readonly readiness: Readiness;
}

/** The parameter set last written into the inputs (B17), until an input is edited. */
export interface AppliedSet {
  readonly origin: ParameterOrigin;
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
  readonly preview: Preview | null;
  /** Set by applying a parameter set; cleared when inputs are edited, reset or rebuilt. */
  readonly applied: AppliedSet | null;
}

type PreviewBase = Pick<Preview, 'set' | 'origin' | 'run' | 'result'>;
type BaseState = Omit<BacktestState, 'properties' | 'outdated' | 'readiness' | 'preview'> & {
  readonly preview: PreviewBase | null;
};
type RunTarget = 'main' | 'preview';

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

function readinessOf(
  state: BaseState,
  properties: readonly PropertyField[],
  inputs: readonly InputField[],
): Readiness {
  const reasons: Message[] = [];
  if (!state.source.trim()) reasons.push(workflowMessage('backtest.noScript'));
  else if (state.compile.status === 'compiling')
    reasons.push(workflowMessage('backtest.compiling'));
  else if (state.compile.status === 'failed')
    reasons.push(workflowMessage('backtest.compileFailed'));
  if (!state.dataset) reasons.push(workflowMessage('backtest.noData'));
  for (const item of inputs)
    if (item.error)
      reasons.push(workflowMessage('backtest.inputInvalid', { title: item.descriptor.title }));
  for (const field of properties)
    if (field.error)
      reasons.push(
        workflowMessage('backtest.propertyInvalid', { property: propertyLabel(field.id) }),
      );
  if (state.run.status === 'running' || state.preview?.run.status === 'running')
    reasons.push(workflowMessage('backtest.running'));
  return { ok: reasons.length === 0, reasons };
}

function previewOf(
  state: BaseState,
  base: PreviewBase,
  properties: readonly PropertyField[],
): Preview {
  const inputs = applyInputValues(state.inputs, base.set, base.origin);
  const changes: PreviewChange[] = [];
  inputs.forEach((item, index) => {
    const current = state.inputs[index].value;
    if (item.origin && item.value !== undefined && !Object.is(item.value, current))
      changes.push({ title: item.descriptor.title, current, preview: item.value });
  });
  return {
    set: base.set,
    origin: base.origin,
    inputs,
    changes,
    run: base.run,
    result: base.result,
    readiness: readinessOf(state, properties, inputs),
  };
}

function derive(state: BaseState): BacktestState {
  const properties = state.scriptProperties
    ? propertyFields(state.scriptProperties, state.propertyOverrides)
    : [];
  return {
    ...state,
    properties,
    outdated: outdatedOf(state),
    readiness: readinessOf(state, properties, state.inputs),
    preview: state.preview && previewOf(state, state.preview, properties),
  };
}

/** The zero-based execution bar for B11 and R11, or null when the diagnostic has no valid bar. */
export function diagnosticBar(diagnostic: Diagnostic | undefined): number | null {
  const bar = (diagnostic as { bar?: unknown } | undefined)?.bar;
  return typeof bar === 'number' && Number.isSafeInteger(bar) ? bar : null;
}

export interface BacktestSessionOptions {
  /** Milliseconds since the epoch; `Date.now` unless a test fixes the clock. */
  now?: () => number;
}

/**
 * One Backtest page: the script and its compile, input values, property overrides, the dataset,
 * the latest run (WEB.md 3.1), and a parameter set previewed from the optimization (3.3). Every
 * change produces a new state object.
 */
export class BacktestSession implements Observable<BacktestState> {
  readonly #client: EngineClient;
  readonly #now: () => number;
  readonly #store: Store<BacktestState>;
  #runToken = 0;
  #datasetRevision = 0;
  /** What the last applied set replaced, for undo; dropped once the inputs change otherwise. */
  #beforeApply: Pick<BaseState, 'inputs' | 'run' | 'result'> | null = null;

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
        preview: null,
        applied: null,
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

  /**
   * End the run in progress, of the current inputs or of the preview, as cancelled. Returns the
   * state change, empty when nothing was running; the caller stops the Worker.
   */
  #interrupt(cause: 'user' | 'source'): Partial<BaseState> {
    const { run, preview } = this.getState();
    if (run.status !== 'running' && preview?.run.status !== 'running') return {};
    this.#runToken++;
    const finishedAt = this.#now();
    const stopped = (state: RunState): RunState =>
      state.status === 'running'
        ? { status: 'cancelled', startedAt: state.startedAt, finishedAt, cause }
        : state;
    return { run: stopped(run), preview: preview && { ...preview, run: stopped(preview.run) } };
  }

  /** Cancel the run in progress through the Worker; returns the state change. */
  #cancelRunning(): Partial<BaseState> {
    const change = this.#interrupt('user');
    if (Object.keys(change).length) this.#client.cancel();
    return change;
  }

  /** Replace the script and recompile it; a run in progress is discarded with the old source. */
  setSource(source: string): void {
    const state = this.getState();
    if (source === state.source) return;
    const sourceRevision = state.sourceRevision + 1;
    const now = this.#now();
    const stopped = this.#interrupt('source');
    this.#client.setSourceRevision(sourceRevision);
    this.#beforeApply = null;
    if (!source.trim()) {
      this.#update({
        ...stopped,
        source,
        sourceRevision,
        compile: { status: 'empty' },
        description: null,
        inputs: [],
        scriptProperties: null,
        applied: null,
      });
      return;
    }
    this.#update({
      ...stopped,
      source,
      sourceRevision,
      compile: { status: 'compiling', startedAt: now },
      applied: null,
    });
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

  /** An edit by the user: an applied set can no longer be undone. */
  #editInputs(inputs: readonly InputField[]): void {
    this.#beforeApply = null;
    this.#update({ inputs, applied: null });
  }

  setInput(title: string, value: LiteralValue): void {
    this.#editInputs(setInputValue(this.getState().inputs, title, value));
  }

  resetInputs(): void {
    this.#editInputs(resetInputValues(this.getState().inputs));
  }

  /** B9: put back the input values the current result was computed with. */
  restoreResultInputs(): void {
    const { result } = this.getState();
    if (!result) return;
    let inputs = this.getState().inputs;
    for (const [title, value] of Object.entries(result.computedWith.inputs))
      inputs = setInputValue(inputs, title, value);
    this.#editInputs(inputs);
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

  /**
   * Drop one override, so the script's own value applies again, a literal or an expression the
   * engine evaluates during the run.
   */
  resetProperty(id: PropertyId): void {
    const { propertyOverrides } = this.getState();
    if (propertyOverrides[id] === undefined) return;
    const next: PropertyOverrides = { ...propertyOverrides };
    delete next[id];
    this.#update({ propertyOverrides: next });
  }

  /** Make `input` the data for the next run; an existing result is then outdated. */
  setDataset(input: DatasetInput): void {
    this.#update({ dataset: { revision: ++this.#datasetRevision, input } });
  }

  /**
   * Start a backtest with the current settings, or run the open preview again; does nothing
   * unless that run's readiness is ok.
   */
  async run(): Promise<void> {
    const state = this.getState();
    const target: RunTarget = state.preview ? 'preview' : 'main';
    const readiness = state.preview ? state.preview.readiness : state.readiness;
    if (!readiness.ok || !state.dataset) return;
    const snapshot: RunSnapshot = {
      source: state.source,
      sourceRevision: state.sourceRevision,
      inputs: inputValues(state.preview ? state.preview.inputs : state.inputs),
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
    this.#setRun(target, { status: 'running', startedAt });
    let output: TrialResult;
    try {
      output = await this.#client.run(snapshot.source, input, snapshot.sourceRevision);
    } catch (error) {
      if (token !== this.#runToken) return;
      const finishedAt = this.#now();
      if (error instanceof WorkerCancelledError || error instanceof WorkerStaleError)
        this.#setRun(target, {
          status: 'cancelled',
          startedAt,
          finishedAt,
          cause: error instanceof WorkerStaleError ? 'source' : 'user',
        });
      else
        this.#setRun(target, {
          status: 'failed',
          startedAt,
          finishedAt,
          failure: { diagnostics: [], bar: null, error: errorText(error) },
        });
      return;
    }
    if (token !== this.#runToken) return;
    const finishedAt = this.#now();
    if (output.diagnostics.length) {
      this.#setRun(target, {
        status: 'failed',
        startedAt,
        finishedAt,
        failure: {
          diagnostics: output.diagnostics,
          bar: diagnosticBar(output.diagnostics[0]),
          error: null,
        },
      });
      return;
    }
    this.#setRun(
      target,
      { status: 'done', startedAt, finishedAt },
      {
        computedWith: snapshot,
        output,
        initialCapital: metricValue(output.metrics, 'Initial capital'),
        durationMs: finishedAt - startedAt,
        finishedAt,
      },
    );
  }

  #setRun(target: RunTarget, run: RunState, result?: BacktestResult): void {
    const change = result ? { run, result } : { run };
    if (target === 'main') this.#update(change);
    else {
      const { preview } = this.getState();
      if (preview) this.#update({ preview: { ...preview, ...change } });
    }
  }

  /** Stop the running backtest or preview; the previous result stays. */
  cancel(): void {
    const change = this.#cancelRunning();
    if (Object.keys(change).length) this.#update(change);
  }

  /**
   * Run the Backtest page on a parameter set from the optimization without changing the current
   * inputs (B16). A run in progress is cancelled first.
   */
  preview(set: Readonly<Record<string, LiteralValue>>, origin: ParameterOrigin): Promise<void> {
    const change = this.#cancelRunning();
    this.#beforeApply = null;
    this.#update({
      ...change,
      preview: { set, origin, run: { status: 'idle' }, result: null },
      applied: null,
    });
    return this.run();
  }

  /** Close the preview (B16); the current inputs and result were never touched. */
  backToOptimization(): void {
    if (!this.getState().preview) return;
    this.#update({ ...this.#cancelRunning(), preview: null });
  }

  /** B16's "Set as current inputs": apply the previewed set. */
  setPreviewAsCurrent(): Promise<void> {
    const { preview } = this.getState();
    return preview ? this.applyParameters(preview.set, preview.origin) : Promise.resolve();
  }

  /**
   * Write a parameter set into the inputs, note where it came from, and run the backtest (B17).
   * When the open preview finished on this set with the same settings, its result becomes the
   * current one without running again.
   */
  async applyParameters(
    set: Readonly<Record<string, LiteralValue>>,
    origin: ParameterOrigin,
  ): Promise<void> {
    const stopped = this.#cancelRunning();
    if (Object.keys(stopped).length) this.#update(stopped);
    const state = this.getState();
    this.#beforeApply = { inputs: state.inputs, run: state.run, result: state.result };
    const inputs = applyInputValues(state.inputs, set, origin);
    const change: Partial<BaseState> = { inputs, preview: null, applied: { origin } };
    const preview = state.preview;
    if (
      preview?.set === set &&
      preview.result &&
      preview.run.status === 'done' &&
      outdatedOf({ ...state, inputs, result: preview.result })?.reasons.length === 0
    ) {
      this.#update({ ...change, run: preview.run, result: preview.result });
      return;
    }
    this.#update(change);
    await this.run();
  }

  /** Put back the inputs and result from before the last applied set (B17's Undo). */
  undoApply(): void {
    const before = this.#beforeApply;
    if (!before || !this.getState().applied) return;
    const stopped = this.#cancelRunning();
    this.#beforeApply = null;
    this.#update({ ...stopped, ...before, applied: null });
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
 * displayed result ignored, when it was computed with the current source. While a preview is open, its run and result are the displayed ones, so
 * a failed combination opened from the optimization shows its diagnostics (R11). An unsupported
 * feature has its own category: missing engine support, not a fault in the script.
 */
export function backtestIssues(
  state: Pick<BacktestState, 'source' | 'compile' | 'run' | 'result' | 'preview'>,
): Issue[] {
  const { run, result } = state.preview ?? state;
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
  if (run.status === 'failed') {
    const { diagnostics, bar, error } = run.failure;
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
  // A result kept from other source text, such as the previous script's after this one's run
  // failed, has warnings on lines this source does not share.
  const warnings =
    result && result.computedWith.source === state.source ? (result.output.warnings ?? []) : [];
  for (const warning of warnings)
    issues.push({
      category: 'ignoredEffect',
      line: warning.line,
      column: null,
      bar: null,
      text: warning.message,
    });
  return issues;
}
