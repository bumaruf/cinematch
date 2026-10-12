import type { Filters } from '../film.ts';

/** Mask consumed spans without moving the positions used by the intent parser. */
export function extractQueryConstraints(source: string): { remaining: string; constraints: Filters; issues: string[] } {
  let remaining = source;
  const constraints: Filters = {};
  const issues: string[] = [];
  const spans: { start: number; end: number }[] = [];
  const negativePrefix = /\b(?:nao(?: quero| seja)?|sem)\s+(?:filmes?\s+)?(?:(?:com|de|dos|das|do|da)\s+)?$/;
  const negated = (match: RegExpMatchArray): boolean => negativePrefix.test(source.slice(0, match.index!));
  const consume = (pattern: RegExp, apply: (match: RegExpMatchArray) => void): void => {
    for (const match of remaining.matchAll(pattern)) {
      apply(match);
      spans.push({ start: match.index!, end: match.index! + match[0].length });
      const start = source.slice(0, match.index!).match(negativePrefix)?.index ?? match.index!;
      const end = match.index! + match[0].length;
      remaining = remaining.slice(0, start) + ' '.repeat(end - start) + remaining.slice(end);
    }
  };
  const lower = (key: 'minYear' | 'minRuntime', value: number): void => { constraints[key] = Math.max(constraints[key] ?? -Infinity, value); };
  const upper = (key: 'maxYear' | 'maxRuntime', value: number): void => { constraints[key] = Math.min(constraints[key] ?? Infinity, value); };
  const yearRange = (min: number, max: number): void => {
    lower('minYear', min); upper('maxYear', max);
  };
  const noNegativeRange = (match: RegExpMatchArray): void => {
    if (negated(match)) issues.push('Não consigo excluir um ano ou intervalo inteiro neste pedido. Use limites como “antes de 2000” ou “mais de 90 minutos”.');
  };
  consume(/(?<!antes |depois |partir )\b(?:entre|de)\s+(18\d{2}|19\d{2}|20\d{2})\s+(?:e|a|ate)\s+(18\d{2}|19\d{2}|20\d{2})\b/g, m => {
    noNegativeRange(m); yearRange(Number(m[1]), Number(m[2]));
  });
  consume(/\b(?:anos|decada de)\s+(\d{4}|\d{2})s?\b/g, m => {
    const value = Number(m[1]);
    const year = Math.floor((value < 100 ? (value < 30 ? 2000 : 1900) + value : value) / 10) * 10;
    noNegativeRange(m);
    yearRange(year, year + 9);
  });
  consume(/\b(?:apos|depois de|a partir de|desde)\s+(18\d{2}|19\d{2}|20\d{2})\b/g, m => {
    const min = Number(m[1]) + (/^(a partir|desde)/.test(m[0]) ? 0 : 1);
    if (negated(m)) upper('maxYear', min - 1); else lower('minYear', min);
  });
  consume(/\b(?:antes de|ate)\s+(18\d{2}|19\d{2}|20\d{2})\b/g, m => {
    const max = Number(m[1]) - (m[0].startsWith('antes') ? 1 : 0);
    if (negated(m)) lower('minYear', max + 1); else upper('maxYear', max);
  });

  const duration = '(?:\\d{1,2}\\s*(?:horas?|h)(?:\\s*(?:e\\s*)?\\d{1,2}\\s*(?:minutos|min|m)?)?|\\d{1,3}\\s*(?:minutos|min|m))';
  const minutes = (text: string): number => {
    const hours = text.match(/^(\d+)\s*(?:horas?|h)(?:\s*(?:e\s*)?(\d+))?/);
    if (!hours) return Number(text.match(/^\d+/)![0]);
    if (Number(hours[2] ?? 0) >= 60) issues.push(`A duração “${text}” tem 60 ou mais minutos depois das horas. Use, por exemplo, 1h40 ou 100 minutos.`);
    return Number(hours[1]) * 60 + Number(hours[2] ?? 0);
  };
  consume(/\b(?:entre|de)\s+(\d{1,3})\s+(?:e|a|ate)\s+(\d{1,3})\s*(?:minutos|min|m)\b/g, m => {
    noNegativeRange(m);
    lower('minRuntime', Number(m[1])); upper('maxRuntime', Number(m[2]));
  });
  consume(new RegExp(`\\b(?:entre|de)\\s+(${duration})\\s+(?:e|a|ate)\\s+(${duration})\\b`, 'g'), m => {
    noNegativeRange(m);
    lower('minRuntime', minutes(m[1])); upper('maxRuntime', minutes(m[2]));
  });
  consume(new RegExp(`\\b(ate|no maximo|menos de|mais de|pelo menos)\\s+(${duration})\\b`, 'g'), m => {
    const value = minutes(m[2]);
    if (/^(mais de|pelo menos)/.test(m[1])) {
      const min = value + (m[1] === 'mais de' ? 1 : 0);
      if (negated(m)) upper('maxRuntime', min - 1); else lower('minRuntime', min);
    } else {
      const max = value - (m[1] === 'menos de' ? 1 : 0);
      if (negated(m)) lower('minRuntime', max + 1); else upper('maxRuntime', max);
    }
  });
  consume(/\b(18\d{2}|19\d{2}|20\d{2})\b/g, m => { noNegativeRange(m); yearRange(Number(m[1]), Number(m[1])); });
  spans.sort((a, b) => a.start - b.start);
  for (let i = 1; i < spans.length; i++) {
    if (/^\s*(?:ou|or)\s*(?:(?:dos|das|de|com)\s*)?$/.test(source.slice(spans[i - 1].end, spans[i].start))) {
      issues.push('Ainda não consigo combinar períodos ou durações com “ou”. Escolha um intervalo; as alternativas com “ou” são aceitas para gêneros e países.');
      break;
    }
  }
  return { remaining, constraints, issues };
}
