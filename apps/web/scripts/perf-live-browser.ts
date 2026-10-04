import { getOptimizationStore } from '../src/state/optimization.ts';
import { getServices } from '../src/state/services.ts';

type Sample = { at: number; duration: number; name: string };
type Snapshot = { at: number; phase: string; completed: number; window: number | null };

/** Loaded only into the measurement build; never included by the application entry. */
function createProbe() {
  let active = false;
  let start = 0;
  let frames: { at: number; duration: number }[] = [];
  let runEnd: number | null = null;
  let tasks: Sample[] = [];
  let events: Sample[] = [];
  let snapshots: Snapshot[] = [];
  let views: number[] = [];
  let messages: (Sample & { trials?: number; bars?: number })[] = [];
  let longFrames: unknown[] = [];
  let interactions: Sample[] = [];
  let label = '';
  let previousFrame = 0;
  let unsubscribe = () => {};
  const observers: PerformanceObserver[] = [];
  for (const type of ['longtask', 'event', 'long-animation-frame']) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
    const observer = new PerformanceObserver((list) => {
      if (!active) return;
      for (const entry of list.getEntries()) {
        if (entry.startTime < start) continue;
        const sample = { at: entry.startTime, duration: entry.duration, name: entry.name };
        if (type === 'longtask') tasks.push(sample);
        else if (type === 'event') events.push(sample);
        else longFrames.push(entry.toJSON());
      }
    });
    observer.observe({ type, durationThreshold: 16 } as PerformanceObserverInit);
    observers.push(observer);
  }
  function frame(at: number) {
    if (active && previousFrame) frames.push({ at, duration: at - previousFrame });
    previousFrame = active ? at : 0;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  for (const type of ['click', 'pointermove', 'wheel'])
    window.addEventListener(
      type,
      (event) => {
        if (!active || !label || !event.isTrusted) return;
        const expected = label.endsWith('map-hover')
          ? 'pointermove'
          : label.endsWith('scroll')
            ? 'wheel'
            : 'click';
        if (event.type !== expected) return;
        const name = label;
        const at = event.timeStamp;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            interactions.push({ name, at, duration: performance.now() - at });
          }),
        );
      },
      { capture: true, passive: true },
    );

  // Time only serialization into real Workers; retain no request or trial objects.
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (
    message,
    transfer?: Transferable[] | StructuredSerializeOptions,
  ) {
    const at = performance.now();
    post.call(this, message, Array.isArray(transfer) ? { transfer } : transfer);
    if (active && typeof message.kind === 'string')
      messages.push({
        at,
        duration: performance.now() - at,
        name: message.kind,
        trials: message.kind === 'runAppend' ? message.input.trials.length : undefined,
        bars: message.kind === 'reproduce' ? message.common?.bars.length : undefined,
      });
  };
  return {
    label(name: string) {
      label = name;
    },
    async configure(mode: 'in-out' | 'walk-forward', count: number) {
      await getServices().loadOptimization();
      const store = getOptimizationStore();
      const { actions, search, viewSettings } = store.getState();
      for (const row of search.rows)
        if (row.draft) actions.setSearched(row.descriptor.title, false);
      // 50 × 20 × 20 = 20,000 distinct sets, with real trailing-stop work enabled.
      for (const [title, from, to, step] of [
        ['Length', 5, 54, 1],
        ['Multiplier', 0.25, 5, 0.25],
        ['Trail %', 0.25, 5, 0.25],
      ] as const) {
        actions.setRange(title, { from, to, step });
        actions.setSearched(title, true);
      }
      actions.setFixedValue('Use trailing stop', true);
      actions.setSampling({ method: 'random', count, seed: 7301 });
      for (let index = viewSettings.filters.length - 1; index >= 0; index--)
        actions.removeFilter(index);
      actions.addFilter({ metric: 'trades', operator: '>=', value: 0 });
      actions.addFilter({ metric: 'maxDrawdown', operator: '<=', value: 100 });
      actions.setObjective('netProfit');
      actions.setValidation({
        mode,
        walkForward: { inSampleMonths: 2, outOfSampleMonths: 1, stepMonths: 6 },
      });
    },
    state() {
      const state = getOptimizationStore().getState();
      return {
        status: state.run.status,
        settings: {
          objective: state.viewSettings.objective,
          filters: state.viewSettings.filters.length,
        },
        progress: state.run.status === 'running' ? state.run.progress : null,
        ready: state.readiness.ok,
        combinations: state.search.sampling?.combinations,
        views: state.views?.completed ?? 0,
        settled:
          state.run.status === 'done' &&
          (state.results?.mode === 'walk-forward'
            ? !!state.walkForward?.stability &&
              !state.walkForward.stability.pending &&
              !state.walkForward.mapPending &&
              !state.walkForward.pending
            : state.topEquity.status === 'ready' && !state.views?.pending),
        windows: state.walkForward?.windows.length,
        bars: getServices().backtest.getState().dataset?.input.bars.length,
        diagnostics: getServices().optimization?.session.getDiagnostics(),
      };
    },
    begin() {
      frames = [];
      tasks = [];
      events = [];
      snapshots = [];
      views = [];
      messages = [];
      longFrames = [];
      interactions = [];
      start = performance.now();
      runEnd = null;
      previousFrame = 0;
      active = true;
      unsubscribe();
      const store = getOptimizationStore();
      unsubscribe = store.subscribe((state, previous) => {
        if (!active) return;
        if (previous.run.status === 'running' && state.run.status !== 'running')
          runEnd = performance.now();
        if (
          state.run.status === 'running' &&
          (previous.run.status !== 'running' || state.run.progress !== previous.run.progress)
        ) {
          const progress = state.run.progress;
          snapshots.push({
            at: performance.now(),
            phase: progress.phase,
            completed: progress.completed,
            window: progress.window?.index ?? null,
          });
        }
        if (state.views?.summary !== previous.views?.summary && state.views)
          views.push(performance.now());
      });
    },
    end() {
      active = false;
      unsubscribe();
      return {
        start,
        runEnd,
        end: performance.now(),
        frames,
        tasks,
        events,
        snapshots,
        views,
        messages,
        longFrames,
        interactions,
      };
    },
  };
}

export type LiveProbe = ReturnType<typeof createProbe>;
declare global {
  interface Window {
    liveProbe: LiveProbe;
  }
}
window.liveProbe = createProbe();
