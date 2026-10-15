import { expect, test, vi } from 'vitest';
import type { OnDeviceModel, OnDeviceModelStatus } from '../../src/application/ports.ts';
import { getOnDeviceModelStatus, interpretSearch } from '../../src/application/query-model.ts';
import { createTestContext } from '../helpers.ts';

const familyAnswer = { requiredGenres: [], anyOfGenres: [], excludedGenres: ['Horror'], preferredGenres: ['Family'], countries: [], excludedCountries: [], keywords: [] };

function fakeModel(status: OnDeviceModelStatus, answer: () => Promise<unknown> = async () => familyAnswer): OnDeviceModel & { prompts: number } {
  const model = {
    prompts: 0,
    status: async () => status,
    promptJson: async () => { model.prompts++; return answer(); },
  };
  return model;
}

test('a disabled setting never calls the model', async () => {
  const model = fakeModel('available');
  const { ctx } = await createTestContext({ onDeviceModel: model });
  expect(await interpretSearch(ctx, 'filme para ver com a família', false)).toEqual({});
  expect(model.prompts).toBe(0);
});

test('a valid answer becomes the search query', async () => {
  const { ctx } = await createTestContext({ onDeviceModel: fakeModel('available') });
  const result = await interpretSearch(ctx, 'filme para ver com a família', true);
  expect(result.interpretedBy).toBe('model');
  expect(result.searchQuery?.interpretation).toEqual(['Priorizar família', 'Sem terror']);
});

test.each([
  ['no API in this context', undefined],
  ['a model still to be downloaded', fakeModel('downloadable')],
  ['a download in progress', fakeModel('downloading')],
  ['an unsupported device', fakeModel('unavailable')],
  ['an invalid answer', fakeModel('available', async () => ({ requiredGenres: ['Telenovela'] }))],
  ['a timeout', fakeModel('available', async () => { throw new DOMException('timeout', 'TimeoutError'); })],
  ['an answer that is not JSON', fakeModel('available', async () => { throw new SyntaxError('Unexpected token'); })],
])('falls back to the rules with %s', async (_label, model) => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const { ctx } = await createTestContext({ onDeviceModel: model });
  expect(await interpretSearch(ctx, 'filme para ver com a família', true)).toEqual({ interpretedBy: 'rules-fallback' });
});

test('quoted titles skip the model even when it is on', async () => {
  const model = fakeModel('available');
  const { ctx } = await createTestContext({ onDeviceModel: model });
  expect(await interpretSearch(ctx, '"Brazil"', true)).toEqual({});
  expect(model.prompts).toBe(0);
});

test('status reports a missing API as unsupported', async () => {
  expect(await getOnDeviceModelStatus((await createTestContext()).ctx)).toBe('unsupported');
  expect(await getOnDeviceModelStatus((await createTestContext({ onDeviceModel: fakeModel('downloadable') })).ctx)).toBe('downloadable');
});

test('settings keep the model off by default and accept only booleans', async () => {
  const { ctx } = await createTestContext();
  expect((await ctx.settings.get()).modelQuery).toBe(false);
  const { updateSettings } = await import('../../src/application/library.ts');
  expect((await updateSettings(ctx, { modelQuery: 'yes' as unknown as boolean })).modelQuery).toBe(false);
  expect((await updateSettings(ctx, { modelQuery: true })).modelQuery).toBe(true);
});
