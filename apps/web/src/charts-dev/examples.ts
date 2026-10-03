import { examples as sharedExamples } from '../../examples/index.ts';

const shared = import.meta.glob<string>('../../examples/**/*.pine', {
  query: '?raw',
  import: 'default',
  eager: true,
});
export const examples = Object.fromEntries(
  sharedExamples.map((example) => [example.id, shared[`../../examples/${example.fileName}`]]),
);
