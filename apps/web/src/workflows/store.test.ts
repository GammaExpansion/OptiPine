import assert from 'node:assert/strict';
import test from 'node:test';
import { workflowMessageIds } from './messages.ts';
import { createStore } from './store.ts';

test('listeners hear every new state until they unsubscribe', () => {
  const store = createStore({ count: 0 });
  const heard: number[] = [];
  const unsubscribe = store.subscribe((state) => heard.push(state.count));
  store.setState({ count: 1 });
  const same = store.getState();
  store.setState(same);
  unsubscribe();
  store.setState({ count: 2 });
  assert.deepEqual(heard, [1]);
  assert.equal(store.getState().count, 2);
});

test('app message ids are unique and dotted by area', () => {
  assert.equal(new Set(workflowMessageIds).size, workflowMessageIds.length);
  for (const id of workflowMessageIds) assert.match(id, /^(backtest|marketData)\.[a-z][\w.]*$/);
});
