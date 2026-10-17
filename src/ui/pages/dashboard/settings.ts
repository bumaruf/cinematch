import type { OnDeviceModelStatus } from '../../../application/ports.ts';
import { send } from '../../../messaging/client.ts';
import { byId } from '../../shared/dom.ts';
import { html, render } from '../../shared/html.ts';
import { canDownloadOnDeviceModel, downloadOnDeviceModel } from '../../shared/on-device-model.ts';
import type { Notifier, ProfileState } from './state.ts';

const MODEL_STATUS: Record<OnDeviceModelStatus, string> = {
  unsupported: 'Este Chrome não oferece a Prompt API ao CineMatch. A busca continua com as regras.',
  unavailable: 'O modelo não está disponível neste dispositivo (requisitos de hardware, espaço ou idioma). A busca continua com as regras.',
  downloadable: 'O modelo ainda não foi baixado. O download é feito pelo Chrome, uma única vez, e ocupa alguns gigabytes.',
  downloading: 'O Chrome está baixando o modelo. Até terminar, a busca usa as regras.',
  available: 'Modelo pronto neste dispositivo.',
};

const POPULARITY_PRESETS = [
  { minVotes: 0, label: 'Sem limite' },
  { minVotes: 10_000, label: '10 mil+ avaliações' },
  { minVotes: 50_000, label: '50 mil+ avaliações' },
  { minVotes: 100_000, label: '100 mil+ avaliações' },
  { minVotes: 250_000, label: '250 mil+ avaliações' },
];

interface SettingsOptions {
  state: ProfileState;
  notify: Notifier;
  /** Opens the profile tab's import section. */
  goToImport: () => void;
  /** Resets the sections that showed the cleared profile. */
  onProfileCleared: () => void;
}

/** The "Configurações" tab: suggestion settings, the on-device model, saved data. */
export function setupSettings({ state, notify, goToImport, onProfileCleared }: SettingsOptions) {
  const avoidWatched = byId<HTMLInputElement>('avoidWatched');
  const includeUnderrated = byId<HTMLInputElement>('includeUnderrated');
  const popularityLevel = byId<HTMLInputElement>('popularityLevel');
  const popularityValue = byId('popularityValue');
  const cacheStatus = byId('cacheStatusArea');
  const clearCacheButton = byId<HTMLButtonElement>('clearCacheBtn');
  const clearCacheDialog = byId<HTMLDialogElement>('clearCacheDialog');
  const modelQuery = byId<HTMLInputElement>('modelQuery');
  const modelStatus = byId('modelStatus');
  const downloadModelButton = byId<HTMLButtonElement>('downloadModelBtn');

  const preset = () => POPULARITY_PRESETS[Number(popularityLevel.value || 0)] ?? POPULARITY_PRESETS[0];

  function renderCacheInfo(): void {
    const profile = state.overview();
    clearCacheButton.disabled = !profile?.username;
    if (!profile?.username) {
      render(cacheStatus, html`<p>Nenhum perfil salvo.</p>`);
      return;
    }
    render(
      cacheStatus,
      html`
        <p><strong class="font-semibold text-ink">${profile.displayName || profile.username}</strong> (@${profile.username})</p>
        <p>${profile.filmCount.toLocaleString('pt-BR')} ${profile.filmCount === 1 ? 'filme' : 'filmes'} no histórico</p>
        ${profile.lastSync ? html`<p>Atualizado em ${new Date(profile.lastSync).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}</p>` : ''}`,
    );
  }

  async function renderModelStatus(): Promise<void> {
    const status = await send('getOnDeviceModelStatus').catch((): OnDeviceModelStatus => 'unavailable');
    modelStatus.textContent = MODEL_STATUS[status];
    downloadModelButton.hidden = !(status === 'downloadable' || status === 'downloading') || !canDownloadOnDeviceModel();
  }

  async function save(): Promise<void> {
    try {
      await send('updateSettings', {
        avoidWatched: avoidWatched.checked,
        includeUnderrated: includeUnderrated.checked,
        minVotes: preset().minVotes,
        modelQuery: modelQuery.checked,
      });
      notify.toast('Salvo ✓', 2000);
    } catch (error) {
      notify.error((error as Error).message);
    }
  }

  async function load(): Promise<void> {
    const settings = await send('getSettings');
    avoidWatched.checked = settings.avoidWatched;
    includeUnderrated.checked = settings.includeUnderrated;
    modelQuery.checked = settings.modelQuery;
    const level = POPULARITY_PRESETS.findIndex((item) => item.minVotes === settings.minVotes);
    popularityLevel.value = String(Math.max(0, level));
    popularityValue.textContent = preset().label;
    await renderModelStatus();
  }

  state.onOverview(renderCacheInfo);
  renderCacheInfo();

  downloadModelButton.addEventListener('click', async () => {
    downloadModelButton.disabled = true;
    try {
      await downloadOnDeviceModel((fraction) => {
        modelStatus.textContent = `Baixando o modelo: ${Math.round(fraction * 100)}%`;
      });
      notify.toast('Modelo pronto ✓');
    } catch (error) {
      notify.error((error as Error).message);
    } finally {
      downloadModelButton.disabled = false;
      await renderModelStatus();
    }
  });
  for (const control of [avoidWatched, includeUnderrated, popularityLevel, modelQuery]) control.addEventListener('change', () => void save());
  popularityLevel.addEventListener('input', () => (popularityValue.textContent = preset().label));
  byId('btnSettingsImportCsv').addEventListener('click', goToImport);
  clearCacheButton.addEventListener('click', () => clearCacheDialog.showModal());
  byId('confirmClearCacheBtn').addEventListener('click', async () => {
    try {
      await send('clearProfile');
      clearCacheDialog.close();
      state.set(null);
      onProfileCleared();
      notify.toast('Perfil apagado. Sincronize ou importe o CSV quando quiser.');
    } catch (error) {
      notify.error((error as Error).message);
    }
  });

  return {
    /** Reads the saved settings and the model status; called when the tab opens. */
    refresh: () => load().catch((error: unknown) => notify.error((error as Error).message)),
  };
}
