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

  function activateTab(tab: string): void {
    for (const item of navItems) item.classList.toggle('active', item.dataset.tab === tab);
    for (const pane of tabPanes) pane.classList.toggle('active', pane.id === `tab-${tab}`);
    const active = state.get();
    if (tab === 'dna' && active) renderDna(active);
    if (tab === 'history') void renderHistory();
    if (tab === 'saved') void saved.renderSaved();
    if (tab === 'settings') void settings.refresh();
    if (tab === 'curator') document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
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
    activateTab('dna');
    const recovery = byId<HTMLDetailsElement>('profileRecovery');
    recovery.open = true;
    recovery.scrollIntoView();
  }

  /** Links into the panel: #settings, #fontes (the credits in Settings), #recovery. */
  function followHash(): void {
    if (location.hash === '#recovery') openRecovery();
    else if (location.hash === '#settings') activateTab('settings');
    else if (location.hash === '#fontes') {
      activateTab('settings');
      byId('fontes').scrollIntoView({ block: 'start' });
    }
  }

  for (const item of navItems) item.addEventListener('click', () => activateTab(item.dataset.tab ?? 'curator'));
  window.addEventListener('hashchange', followHash);

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
