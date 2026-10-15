import { expect, test } from 'vitest';
import { allowedShortfall, isHistoryComplete } from '../../src/domain/profile/completeness.ts';

test('small histories must be complete; large ones tolerate one film per 500', () => {
  expect(allowedShortfall(0)).toBe(0);
  expect(allowedShortfall(499)).toBe(0);
  expect(allowedShortfall(500)).toBe(1);
  expect(allowedShortfall(2400)).toBe(4);
  expect(isHistoryComplete(1, 2)).toBe(false);
  expect(isHistoryComplete(999, 1000)).toBe(true);
  expect(isHistoryComplete(990, 1000)).toBe(false);
});

test('more films than reported are complete: they were logged during the sync', () => {
  expect(isHistoryComplete(3, 2)).toBe(true);
});
