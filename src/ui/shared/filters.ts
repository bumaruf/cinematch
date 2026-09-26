import type { RecommendationQuery } from '../../application/recommendations.ts';
import type { RuntimeFilter } from '../../domain/film.ts';
import { parseDecade } from '../../domain/recommend/filters.ts';

export interface FilterControls {
  decade: HTMLSelectElement;
  runtime: HTMLSelectElement;
  nicheOnly: HTMLInputElement;
}

/** Reads the filter form shared by the popup and the dashboard. */
export function readFilters(controls: FilterControls): NonNullable<RecommendationQuery['filters']> {
  const { minYear, maxYear } = parseDecade(controls.decade.value);
  return {
    minYear,
    maxYear,
    runtimeFilter: (controls.runtime.value || '') as RuntimeFilter | '',
    nicheOnly: controls.nicheOnly.checked,
  };
}
