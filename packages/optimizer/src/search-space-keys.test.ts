import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSearchSpace, enumerateGrid, stableTrialId } from './search-space.ts';
import type { InputDescriptor } from '@pine/engine';

test('input titles that collide with Object.prototype members stay ordinary parameter keys', () => {
  const descriptors: InputDescriptor[] = [
    {
      id: 'input-1',
      title: '__proto__',
      type: 'int',
      defaultValue: 2,
      min: 1,
      max: 3,
      step: 1,
      fixed: false,
      line: 1,
    },
    { id: 'input-2', title: 'constructor', type: 'int', defaultValue: 5, fixed: false, line: 2 },
  ];
  const space = generateSearchSpace(descriptors, { active: { constructor: false } });
  assert.deepEqual(
    space.activeAxes.map((axis) => axis.title),
    ['__proto__'],
  );
  assert.deepEqual(Object.entries(space.fixedParameters ?? {}), [['constructor', 5]]);
  const trials = enumerateGrid(space);
  assert.deepEqual(
    trials.map((trial) => Object.entries(trial)),
    [
      [
        ['constructor', 5],
        ['__proto__', 1],
      ],
      [
        ['constructor', 5],
        ['__proto__', 2],
      ],
      [
        ['constructor', 5],
        ['__proto__', 3],
      ],
    ],
  );
  assert.ok(trials.every((trial) => Object.getPrototypeOf(trial) === Object.prototype));
  assert.equal(new Set(trials.map(stableTrialId)).size, 3);
});
