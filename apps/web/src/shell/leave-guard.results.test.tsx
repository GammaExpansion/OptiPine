import { afterEach, beforeEach, expect, test } from 'vitest';
import {
  loadOptimization,
  runOptimization,
  useOptimizeTestServices,
} from '../pages/optimize/test-support.tsx';
import { installLeaveGuard } from './leave-guard.ts';

useOptimizeTestServices();
let remove: () => void;
beforeEach(() => {
  remove = installLeaveGuard();
});
afterEach(() => remove());

const leave = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

test('leaving asks first while an optimization has results, which nothing saves', async () => {
  await loadOptimization();
  expect(leave()).toBe(false);
  await runOptimization();
  expect(leave()).toBe(true);
});
