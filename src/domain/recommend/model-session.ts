/**
 * Chrome's model accepts English, Spanish, Japanese, German and French. The
 * request is Portuguese; the closest supported language is declared and the
 * output is constrained to English identifiers by the schema. Kept apart from
 * `query-model.ts` so the options page does not bundle the parser.
 */
export const MODEL_SESSION_OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['en', 'es'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
} as const;
