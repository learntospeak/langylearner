const { test, describe } = require('node:test');
const assert = require('node:assert');

const { shuffle } = require('./memorymatch.js');

describe('shuffle', () => {
  test('returns a permutation of the input', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    assert.deepStrictEqual([...result].sort(), [...input].sort());
  });

  test('does not mutate the original array', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffle(input);
    assert.deepStrictEqual(input, copy);
  });

  test('produces different orderings on multiple runs', () => {
    const input = Array.from({ length: 10 }, (_, i) => i);
    const results = new Set();
    for (let i = 0; i < 5; i++) {
      results.add(shuffle(input).join(','));
    }
    assert.ok(results.size > 1);
  });
});
