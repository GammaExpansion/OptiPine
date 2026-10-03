import { expect, it } from 'vitest';
import { moveAxis } from './axis-move.ts';
import { sensitivityPaths } from './spark-geometry.ts';

it('picks up, moves within bounds, confirms once and cancels without committing', () => {
  const titles = ['Length', 'Multiplier', 'Source'];
  const picked = moveAxis(null, { type: 'pick', role: 'x', index: 0 }, titles)!;
  expect(picked.commit).toBeUndefined();
  const moved = moveAxis(picked.move, { type: 'step', delta: 1 }, titles)!;
  expect(moved.move?.target).toBe(1);
  const end = moveAxis(moved.move, { type: 'step', delta: 100 }, titles)!;
  expect(end.move?.target).toBe(2);
  const result = moveAxis(end.move, { type: 'confirm' }, titles)!;
  expect(result.commit).toEqual({ role: 'x', title: 'Source' });
  expect(result.move).toBeNull();
  expect(result.announcement.id).toBe('optimize.sensitivity.moved');
  expect(moveAxis(end.move, { type: 'cancel' }, titles)?.commit).toBeUndefined();
  expect(moveAxis(null, { type: 'confirm' }, titles)).toBeNull();
});

it('pointer targets use the same confirmation and invalid pickups are ignored', () => {
  const titles = ['Length', 'Source'];
  const picked = moveAxis(null, { type: 'pick', role: 'y', index: 1 }, titles)!;
  const moved = moveAxis(picked.move, { type: 'target', index: 0 }, titles)!;
  expect(moveAxis(moved.move, { type: 'confirm' }, titles)?.commit).toEqual({
    role: 'y',
    title: 'Length',
  });
  expect(moveAxis(null, { type: 'pick', role: 'x', index: 3 }, titles)).toBeNull();
});

it('sparks share a scale and break at missing means', () => {
  const point = {
    parameter: 'Length',
    value: 1,
    mean: 5,
    q1: 2,
    q3: 8,
    count: 10,
    etaSquared: 0.2,
  };
  const paths = sensitivityPaths([point, { ...point, mean: null }, point], [0, 10]);
  expect(paths.segments).toHaveLength(2);
  expect(paths.dots[0].y).toBe(13);
  expect(paths.segments[0].band).toContain('6.399999999999999');
  expect(sensitivityPaths([point], [0, 20]).dots[0].y).toBe(18.5);
});
