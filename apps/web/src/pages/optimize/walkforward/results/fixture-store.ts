import {
  getOptimizationStore,
  type OptimizationStoreState,
} from '../../../../state/optimization.ts';
import { naturalDirection } from '../../../../workflows/optimize-ranking.ts';
import { fixtureMap } from '../stability/fixture.ts';
import { installStabilityFixture } from '../stability/fixture-store.ts';
import type { ResultsActions } from './actions.ts';
import { fixtureOrigin, resultsFixture } from './fixture.ts';

/** Test-only adapter, dynamically imported by the browser tests and absent from app imports. */
export function installResultsFixture(initial = resultsFixture()) {
  const hook = installStabilityFixture(initial);
  const store = getOptimizationStore();
  const current = () => store.getState().walkForward!;
  const actions: OptimizationStoreState['actions'] & ResultsActions = {
    ...store.getState().actions,
    selectWindow(index) {
      const window = current().windows.find((window) => window.plan.index === index);
      if (!window) return;
      hook.calls.push({ action: 'selectWindow', value: index });
      hook.publish({
        ...current(),
        selection: { window, explicit: true, origin: fixtureOrigin(window) },
        map: current().map ? fixtureMap(current(), { window: index }) : null,
      });
    },
    applyFixedParameters() {
      hook.calls.push({ action: 'applyFixedParameters', value: current().fixed });
    },
    async previewWindow(index) {
      hook.calls.push({ action: 'previewWindow', value: index });
    },
    setObjective(objective) {
      hook.calls.push({ action: 'setObjective', value: objective });
      store.setState({
        viewSettings: {
          ...store.getState().viewSettings,
          objective,
          direction: naturalDirection(objective),
        },
      });
    },
    setDirection(direction) {
      hook.calls.push({ action: 'setDirection', value: direction });
      store.setState({ viewSettings: { ...store.getState().viewSettings, direction } });
    },
    removeFilter(index) {
      hook.calls.push({ action: 'removeFilter', value: index });
      store.setState({
        viewSettings: {
          ...store.getState().viewSettings,
          filters: store.getState().viewSettings.filters.filter((_, at) => at !== index),
        },
      });
    },
    addFilter(filter) {
      hook.calls.push({ action: 'addFilter', value: filter });
      store.setState({
        viewSettings: {
          ...store.getState().viewSettings,
          filters: [...store.getState().viewSettings.filters, filter],
        },
      });
    },
    setDraftFilter(filter) {
      hook.calls.push({ action: 'setDraftFilter', value: filter });
    },
  };
  store.setState({ actions });
  return hook;
}
