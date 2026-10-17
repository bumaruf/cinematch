import { send } from '../../../messaging/client.ts';
import { byId, hide, onReady, show } from '../../shared/dom.ts';
import { setupCurator } from './curator.ts';
import { setupDailyHero } from './daily.ts';
import { renderDna } from './dna.ts';
import { setupFeedbackReview } from './feedback.ts';
import { renderHistory, setupSaved } from './library.ts';
import { setupProfile } from './profile.ts';
import { setupSettings } from './settings.ts';
import { createProfileState, type Notifier } from './state.ts';

onReady(async () => {
  const toastElement = byId('dashToast');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const notify: Notifier = {
    toast(message, durationMs = 4000, tone = 'default') {
      toastElement.textContent = message;
      toastElement.classList.toggle('border-danger', tone === 'error');
      toastElement.classList.toggle('text-danger', tone === 'error');
      show(toastElement);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => hide(toastElement), durationMs);
    },
    error: (message) => notify.toast(message, 7000, 'error'),
  };

  const state = createProfileState();
  const navItems = [...document.querySelectorAll<HTMLElement>('.nav-item')];
  const tabPanes = [...document.querySelectorAll<HTMLElement>('.tab-pane')];

  const saved = setupSaved({ notify, goToCurator: () => activateTab('curator') });
  const feedback = setupFeedbackReview(state.username, notify);
  const daily = setupDailyHero(state.username, () => void saved.updateBadge());
  const curator = setupCurator({ notify, onSavedChange: () => void saved.updateBadge(), hasDaily: () => daily.hasContent(), currentUsername: state.username });
  const resetProfileSections = (): void => {
    curator.reset();
    daily.clear();
    feedback.reset();
  };
  setupProfile({ state, notify, beforeChange: resetProfileSections });
  const settings = setupSettings({ state, notify, goToImport: () => openRecovery(), onProfileCleared: resetProfileSections });

  /**
   * Shows a tab from its top. A link that opened the panel at a section
   * (#fontes, #recovery) keeps its address; a plain switch clears it, so a
   * reload does not jump back.
   */
  function activateTab(tab: string, { keepHash = false } = {}): void {
    for (const item of navItems) item.classList.toggle('active', item.dataset.tab === tab);
    for (const pane of tabPanes) pane.classList.toggle('active', pane.id === `tab-${tab}`);
    if (!keepHash && location.hash) history.replaceState(null, '', location.pathname + location.search);
    window.scrollTo({ top: 0 });
    const active = state.get();
    if (tab === 'dna' && active) renderDna(active);
    if (tab === 'history') void renderHistory();
    if (tab === 'saved') void saved.renderSaved();
    if (tab === 'settings') void settings.refresh();
  }

  // The daily pick only needs to know who is active, so it starts with the overview.
  state.onOverview((overview) => {
    void curator.refreshEvaluation();
    if (overview) void daily.load();
  });
  state.subscribe((active) => {
    if (active) renderDna(active);
  });

  function openRecovery(): void {
    activateTab('dna', { keepHash: true });
    const recovery = byId<HTMLDetailsElement>('profileRecovery');
    recovery.open = true;
    recovery.scrollIntoView();
  }

  /** Links into the panel: #settings, #fontes (the credits in Settings), #recovery. */
  function followHash(): void {
    if (location.hash === '#recovery') openRecovery();
    else if (location.hash === '#settings') activateTab('settings', { keepHash: true });
    else if (location.hash === '#fontes') {
      activateTab('settings', { keepHash: true });
      byId('fontes').scrollIntoView({ block: 'start' });
    }
  }

  for (const item of navItems) item.addEventListener('click', () => activateTab(item.dataset.tab ?? 'curator'));
  window.addEventListener('hashchange', followHash);
  // The logo goes back to the start: Descobrir, from the top.
  byId('homeLink').addEventListener('click', (event) => {
    event.preventDefault();
    activateTab('curator');
  });

  try {
    // The overview needs no catalog; the catalog warms up meanwhile, and the
    // statistics follow without holding up the daily pick.
    void send('warmUp').catch(() => {});
    const summary = await send('getProfileSummary');
    state.setOverview(summary?.profile ?? null);
    void saved.updateBadge();
    if (summary) state.setActive(await send('getActiveProfile'));
  } catch (error) {
    notify.error((error as Error).message);
  }

  followHash();
});
