import { Markup } from './html.ts';

// Stroke icons drawn on a 24px grid; they inherit color and take their size
// from the parent (see .btn-icon).
const icon = (paths: string): Markup =>
  new Markup(
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`,
  );

export const ICONS = {
  bookmark: icon('<path d="M6 3.5h12v17l-6-4-6 4z"/>'),
  bookmarkFilled: new Markup(
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5h12v17l-6-4-6 4z"/></svg>',
  ),
  external: icon('<path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  settings: icon('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  refresh: icon('<path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4"/>'),
  close: icon('<path d="M6 6l12 12M18 6L6 18"/>'),
  search: icon('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>'),
  star: new Markup('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9-4.4-4.1 6-.8z"/></svg>'),
  back: icon('<path d="M15 5l-7 7 7 7"/>'),
  play: new Markup(
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>',
  ),
};
