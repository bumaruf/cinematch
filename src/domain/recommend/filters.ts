import type { Filters, RuntimeFilter } from '../film.ts';

const RUNTIME_RANGES: Record<RuntimeFilter, [number, number]> = {
  'under-60': [1, 60],
  'under-90': [1, 90],
  'under-105': [1, 105],
  'under-120': [1, 120],
  '90-120': [90, 120],
  'over-120': [120, Infinity],
  'over-150': [150, Infinity],
};

/** Explain an empty intersection before searching, including form + text bounds. */
export function constraintConflict(...filters: Filters[]): string | null {
  const minYear = Math.max(...filters.map(filter => filter.minYear ?? -Infinity));
  const maxYear = Math.min(...filters.map(filter => filter.maxYear ?? Infinity));
  if (minYear > maxYear) return 'Os períodos pedidos não se cruzam. Revise os anos no texto e no filtro de época.';
  const minRuntime = Math.max(1, ...filters.flatMap(filter => [filter.minRuntime ?? 1, filter.runtimeFilter ? RUNTIME_RANGES[filter.runtimeFilter][0] : 1]));
  const maxRuntime = Math.min(...filters.flatMap(filter => [filter.maxRuntime ?? Infinity, filter.runtimeFilter ? RUNTIME_RANGES[filter.runtimeFilter][1] : Infinity]));
  if (minRuntime > maxRuntime) return 'Os limites de duração não se cruzam. Revise a duração no texto e no filtro de duração.';
  return null;
}

export interface Constrainable {
  year?: number | string | null;
  runtime?: number | null;
  runtimeMinutes?: number | null;
  runtimeKnown?: boolean;
}

/** Hard year and runtime constraints shared by every recommendation path. */
export function passesConstraints(movie: Constrainable, filters: Filters = {}): boolean {
  const year = Number(movie.year);
  const runtime = Number(movie.runtimeMinutes ?? movie.runtime);
  if ((filters.runtimeFilter || filters.maxRuntime || filters.minRuntime) && movie.runtimeKnown === false) return false;
  if (filters.minYear && (!year || year < Number(filters.minYear))) return false;
  if (filters.maxYear && (!year || year > Number(filters.maxYear))) return false;
  const range = filters.runtimeFilter ? RUNTIME_RANGES[filters.runtimeFilter] : undefined;
  if (range && (!Number.isFinite(runtime) || runtime < range[0] || runtime > range[1])) return false;
  if (typeof filters.maxRuntime === 'number' && (!runtime || runtime > filters.maxRuntime)) return false;
  if (typeof filters.minRuntime === 'number' && (!runtime || runtime < filters.minRuntime)) return false;
  return true;
}

/** "1980-1989" → { minYear: 1980, maxYear: 1989 }; anything else → no bounds. */
export function parseDecade(decade: string | null | undefined): { minYear: number | null; maxYear: number | null } {
  const [min, max] = String(decade ?? '')
    .split('-')
    .map(Number);
  return Number.isInteger(min) && Number.isInteger(max) && min > 0 ? { minYear: min, maxYear: max } : { minYear: null, maxYear: null };
}
