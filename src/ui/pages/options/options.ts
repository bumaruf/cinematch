import { send } from '../../../messaging/client.ts';
import { byId, onReady } from '../../shared/dom.ts';
import { html, render } from '../../shared/html.ts';

const POPULARITY_PRESETS = [
  { minVotes: 0, label: 'Sem limite' },
  { minVotes: 10_000, label: '10 mil+ avaliações' },
  { minVotes: 50_000, label: '50 mil+ avaliações' },
  { minVotes: 100_000, label: '100 mil+ avaliações' },
  { minVotes: 250_000, label: '250 mil+ avaliações' },
];

onReady(async () => {
  const avoidWatched = byId<HTMLInputElement>('avoidWatched');
  const includeUnderrated = byId<HTMLInputElement>('includeUnderrated');
  const popularityLevel = byId<HTMLInputElement>('popularityLevel');
  const popularityValue = byId('popularityValue');
  const cacheStatus = byId('cacheStatusArea');
  const clearCacheButton = byId<HTMLButtonElement>('clearCacheBtn');
  const clearCacheDialog = byId<HTMLDialogElement>('clearCacheDialog');
  const saveMessage = byId('saveMessage');

  const preset = () => POPULARITY_PRESETS[Number(popularityLevel.value || 0)] ?? POPULARITY_PRESETS[0];

  function toast(message: string): void {
    saveMessage.textContent = message;
    saveMessage.classList.add('visible');
    setTimeout(() => saveMessage.classList.remove('visible'), 3000);
  }

  async function renderCacheInfo(): Promise<void> {
    const active = await send('getActiveProfile');
    clearCacheButton.disabled = !active?.profile.username;
    if (!active?.profile.username) {
      render(cacheStatus, html`<p>Nenhum perfil salvo.</p>`);
      return;
    }
    const { profile } = active;
    render(
      cacheStatus,
      html`
        <p><strong class="font-semibold text-ink">${profile.displayName || profile.username}</strong> (@${profile.username})</p>
        <p>${profile.films.length.toLocaleString('pt-BR')} filmes no histórico</p>
        ${profile.lastSync ? html`<p>Atualizado em ${new Date(profile.lastSync).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}</p>` : ''}`,
    );
  }

  async function save(): Promise<void> {
    try {
      await send('updateSettings', {
        avoidWatched: avoidWatched.checked,
        includeUnderrated: includeUnderrated.checked,
        minVotes: preset().minVotes,
      });
      toast('Salvo automaticamente ✓');
    } catch (error) {
      toast((error as Error).message);
    }
  }

  const settings = await send('getSettings');
  avoidWatched.checked = settings.avoidWatched;
  includeUnderrated.checked = settings.includeUnderrated;
  const level = POPULARITY_PRESETS.findIndex((item) => item.minVotes === settings.minVotes);
  popularityLevel.value = String(Math.max(0, level));
  popularityValue.textContent = preset().label;
  await renderCacheInfo();

  for (const control of [avoidWatched, includeUnderrated, popularityLevel]) control.addEventListener('change', () => void save());
  popularityLevel.addEventListener('input', () => (popularityValue.textContent = preset().label));
  clearCacheButton.addEventListener('click', () => clearCacheDialog.showModal());
  byId('confirmClearCacheBtn').addEventListener('click', async () => {
    try {
      await send('clearProfile');
      clearCacheDialog.close();
      await renderCacheInfo();
      toast('Cache de perfil limpo. Sincronize novamente quando quiser.');
    } catch (error) {
      toast((error as Error).message);
    }
  });
});
