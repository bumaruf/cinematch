import { expect, test } from 'vitest';
import type { StructuredPrompt } from '../../src/application/ports.ts';
import { chromeOnDeviceModel, type LanguageModelApi, type LanguageModelSession } from '../../src/infrastructure/on-device-model.ts';

const request: StructuredPrompt = { instructions: 'system', input: 'drama', schema: { type: 'object' }, sessionOptions: { expectedInputs: [] }, timeoutMs: 1000 };

function fakeApi(availability: string, answer = '{"requiredGenres":["Drama"]}') {
  const calls = { create: [] as object[], prompts: [] as { input: string; options?: object }[], destroyed: 0 };
  const session = (): LanguageModelSession => ({
    async prompt(input, options) { calls.prompts.push({ input, options }); return answer; },
    async clone() { return session(); },
    destroy() { calls.destroyed++; },
  });
  const api: LanguageModelApi = {
    availability: async () => availability,
    create: async (options) => { calls.create.push(options ?? {}); return session(); },
  };
  return { api, calls };
}

test('without the global API the model is unsupported', async () => {
  expect(await chromeOnDeviceModel(undefined).status({})).toBe('unsupported');
  await expect(chromeOnDeviceModel(undefined).promptJson(request)).rejects.toThrow();
});

test('never creates a session (and so never starts a download) unless the model is available', async () => {
  for (const status of ['downloadable', 'downloading', 'unavailable']) {
    const { api, calls } = fakeApi(status);
    await expect(chromeOnDeviceModel(api).promptJson(request)).rejects.toThrow(/não está pronto/);
    expect(calls.create).toEqual([]);
  }
});

test('prompts a clone with the schema and reuses the base session', async () => {
  const { api, calls } = fakeApi('available');
  const model = chromeOnDeviceModel(api);
  expect(await model.promptJson(request)).toEqual({ requiredGenres: ['Drama'] });
  await model.promptJson({ ...request, input: 'comédia' });
  expect(calls.create).toHaveLength(1);
  expect(calls.create[0]).toMatchObject({ expectedInputs: [], initialPrompts: [{ role: 'system', content: 'system' }] });
  expect(calls.prompts.map(call => call.input)).toEqual(['drama', 'comédia']);
  expect(calls.prompts[0].options).toMatchObject({ responseConstraint: { type: 'object' } });
  expect(calls.destroyed).toBe(2);
});

test('an answer that is not JSON is an error, not a query', async () => {
  const { api } = fakeApi('available', 'Claro! Aqui estão os critérios');
  await expect(chromeOnDeviceModel(api).promptJson(request)).rejects.toThrow(SyntaxError);
});

test('unknown availability values are treated as unavailable', async () => {
  expect(await chromeOnDeviceModel(fakeApi('readily').api).status({})).toBe('unavailable');
});

test('preparing creates the base session once, only for an available model, and prompts reuse it', async () => {
  const waiting = fakeApi('downloadable');
  await chromeOnDeviceModel(waiting.api).prepare?.(request);
  expect(waiting.calls.create).toEqual([]);

  const ready = fakeApi('available');
  const model = chromeOnDeviceModel(ready.api);
  await model.prepare?.(request);
  await model.prepare?.(request);
  await model.promptJson(request);
  expect(ready.calls.create).toHaveLength(1);
});
