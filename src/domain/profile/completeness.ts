/**
 * Letterboxd's film count can drift from its paginated list (a film removed
 * from its database, or one logged while the sync runs). Large histories may
 * miss one film per 500 so a sync does not fail forever; smaller ones, where
 * a missing film weighs more, must match exactly.
 */
export function allowedShortfall(expected: number): number {
  return Math.max(0, Math.floor(expected * 0.002));
}

/** Whether a collected history covers the reported count closely enough. */
export function isHistoryComplete(collected: number, expected: number): boolean {
  return collected >= expected - allowedShortfall(expected);
}
