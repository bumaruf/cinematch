import type { InterpretedBy } from '../../domain/film.ts';

const PREFIX: Record<InterpretedBy, string> = {
  model: 'Entendi com o Gemini Nano, no seu dispositivo',
  'rules-fallback': 'Entendi pelas regras (o modelo não pôde ser usado)',
};

/** The criteria applied to a search, and who read them. */
export function interpretationText(interpretation: string[] | undefined, interpretedBy?: InterpretedBy): string {
  if (!interpretation?.length) return '';
  return `${interpretedBy ? PREFIX[interpretedBy] : 'Entendi'}: ${interpretation.join(' · ')}`;
}
