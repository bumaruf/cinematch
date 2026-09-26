import { send } from '../../../messaging/client.ts';
import { byId, hide, onReady, show } from '../../shared/dom.ts';
import { setupCurator } from './curator.ts';
import { setupDailyHero } from './daily.ts';
import { renderDna } from './dna.ts';
import { renderHistory, setupSaved } from './library.ts';
import { setupProfile } from './profile.ts';
import { createProfileState, type Notifier } from './state.ts';

onReady(async () => {
  const toastElement = byId('dashToast');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const notify: Notifier = {
    toast(message, durationMs = 4000) {
      toastElement.textContent = message;
      show(toastElement);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => hide(toastElement), durationMs);
    },
    error: (message) => alert(message),
  };

  const state = createProfileState();
  const navItems = [...document.querySelectorAll<HTMLElement>('.nav-item')];
  const tabPanes = [...document.querySelectorAll<HTMLElement>('.tab-pane')];

  const saved = setupSaved({ notify, goToCurator: () => activateTab('curator') });
  const daily = setupDailyHero(() => state.get()?.profile.username ?? null, () => void saved.updateBadge());
  const curator = setupCurator({ notify, onSavedChange: () => void saved.updateBadge(), hasDaily: () => daily.hasContent() });
  setupProfile({
    state,
    notify,
    beforeChange: () => {
      curator.reset();
      daily.clear();
    },
  });

  function activateTab(tab: string): void {
    for (const item of navItems) item.classList.toggle('active', item.dataset.tab === tab);
    for (const pane of tabPanes) pane.classList.toggle('active', pane.id === `tab-${tab}`);
    const active = state.get();
    if (tab === 'dna' && active) renderDna(active);
    if (tab === 'history') void renderHistory();
    if (tab === 'saved') void saved.renderSaved();
    if (tab === 'curator') document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  state.subscribe((active) => {
    if (!active) return;
    renderDna(active);
    void daily.load();
  });

  for (const item of navItems) item.addEventListener('click', () => activateTab(item.dataset.tab ?? 'curator'));
  byId('btnOpenOptionsPage').addEventListener('click', () => void chrome.runtime.openOptionsPage());

  try {
    state.set(await send('getActiveProfile'));
  } catch (error) {
    notify.error((error as Error).message);
  }
  await saved.updateBadge();

  if (location.hash === '#recovery') {
    activateTab('dna');
    const recovery = byId<HTMLDetailsElement>('profileRecovery');
    recovery.open = true;
    recovery.scrollIntoView();
  }
});
