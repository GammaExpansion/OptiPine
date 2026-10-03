import { getOptimizationStore } from '../../../../state/optimization.ts';
import { windowSelection, type WalkForwardView } from '../../../../workflows/walk-forward.ts';
import { fixtureMap, stabilityFixture } from './fixture.ts';

/** Test-only hook: imported by Vitest or dynamically by Playwright, absent from app imports. */
export function installStabilityFixture(initial = stabilityFixture()) {
  const store = getOptimizationStore();
  const original = store.getState();
  const calls: { action: string; value: unknown }[] = [];
  const current = () => store.getState().walkForward!;
  const publish = (walkForward: WalkForwardView) => store.setState({ walkForward });
  const actions: typeof original.actions = {
    ...original.actions,
    setStabilityTolerance(tolerance) {
      calls.push({ action: 'tolerance', value: tolerance });
      publish({ ...current(), stability: stabilityFixture(tolerance).stability });
    },
    selectWindow(index) {
      calls.push({ action: 'window', value: index });
      const selection = windowSelection(current().windows, index, 1);
      publish({
        ...current(),
        selection,
        map: selection
          ? fixtureMap(current(), { window: selection.window.plan.index })
          : current().map,
      });
    },
    setWindowMapSurface(surface) {
      calls.push({ action: 'surface', value: surface });
      publish({ ...current(), map: fixtureMap(current(), { surface }) });
    },
    setAxis(axis, title) {
      calls.push({ action: axis, value: title });
      publish({ ...current(), map: fixtureMap(current(), { [axis]: title }) });
    },
    setSlice(title, slice) {
      calls.push({ action: 'slice', value: { title, slice } });
      publish({
        ...current(),
        map: fixtureMap(current(), {
          slices: current().map!.slices.map((item) =>
            item.title === title ? { ...item, ...slice } : item,
          ),
        }),
      });
    },
  };
  store.setState({ walkForward: initial, actions });
  return { calls, publish, restore: () => store.setState(original) };
}
