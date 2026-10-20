import type { ImportSummary } from '../../../application/profile.ts';
import type { ProfileOverview } from '../../../application/profile.ts';
import { send, syncProfileFully } from '../../../messaging/client.ts';
import { byId, hide, show } from '../../shared/dom.ts';
import { safeUrl } from '../../shared/html.ts';
import type { Notifier, ProfileState } from './state.ts';

function importMessage(summary: ImportSummary): string {
  if (summary.unmatchedCount) {
    return `${summary.unmatchedCount} registros de notas/diário não puderam ser associados ao histórico e não foram adicionados. Revise o histórico completo para conferir.`;
  }
  return summary.authoritative
    ? 'Histórico reconstruído a partir de watched.csv; notas e diário associados sem aumentar a lista.'
    : 'Notas atualizadas no histórico existente. Para substituir a lista de assistidos, importe watched.csv.';
}

/** Sidebar profile, CSV import (the main path) and the optional Letterboxd sync. */
export function setupProfile({ state, notify, beforeChange }: { state: ProfileState; notify: Notifier; beforeChange: () => void }) {
  const el = {
    avatar: byId<HTMLImageElement>('sideUserAvatar'),
    avatarFallback: byId('sideAvatarFallback'),
    displayName: byId('sideDisplayName'),
    username: byId('sideUsername'),
    sync: byId<HTMLButtonElement>('sideBtnSync'),
    refreshDna: byId<HTMLButtonElement>('btnRefreshDna'),
    importDna: byId<HTMLButtonElement>('btnImportCsvDna'),
    csvInput: byId<HTMLInputElement>('csvFileInput'),
    status: byId('syncStatus'),
    csvModal: byId('csvTutorialModal'),
  };

  function renderSidebar(profile: ProfileOverview | null): void {
    if (!profile) {
      el.displayName.textContent = 'Nenhum perfil';
      el.username.textContent = 'Importe o CSV';
      return;
    }
    el.displayName.textContent = profile.displayName || profile.username;
    el.username.textContent = `@${profile.username}`;
    show(el.avatar, Boolean(profile.avatarUrl));
    show(el.avatarFallback, !profile.avatarUrl);
    if (profile.avatarUrl) el.avatar.src = safeUrl(profile.avatarUrl, '');
    else el.avatarFallback.textContent = (profile.displayName || profile.username).slice(0, 1).toUpperCase();
  }

  function setBusy(busy: boolean): void {
    el.sync.disabled = busy;
    el.refreshDna.disabled = busy;
    el.importDna.disabled = busy;
  }

  async function sync(forceFull = false): Promise<void> {
    if (el.sync.disabled) return;
    const username = prompt('Informe o @username do Letterboxd para sincronizar:', state.username() ?? '')?.trim();
    if (!username) return;
    setBusy(true);
    beforeChange();
    notify.toast(`Iniciando sincronização de @${username}...`);
    try {
      const result = await syncProfileFully(username, { forceFull, onProgress: (message) => (el.status.textContent = message) });
      state.set(result);
      notify.toast(`Perfil @${result.profile.username} sincronizado.`);
      el.status.textContent =
        result.profile.syncMode === 'recent'
          ? 'Atividades recentes atualizadas. A revisão completa ocorre na próxima sincronização após sete dias.'
          : `Revisão completa: ${result.profile.filmCount} filmes sincronizados.`;
    } catch (error) {
      const message = (error as Error).message || 'Sincronização interrompida. Tente novamente para retomar.';
      el.status.textContent = message;
      notify.error(`Erro ao sincronizar: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(files: File[]): Promise<void> {
    if (!files.length || el.sync.disabled) return;
    setBusy(true);
    try {
      const summary = await send('importCsvProfile', {
        files: await Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() }))),
      });
      beforeChange();
      state.set(summary);
      el.status.textContent = importMessage(summary);
      notify.toast(
        `Importação concluída: ${summary.addedCount} novos filmes, ${summary.updatedRatingCount} notas atualizadas. ${summary.profile.filmCount} filmes únicos.`,
        8000,
      );
    } catch (error) {
      notify.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ── CSV help modal ────────────────────────────────────────────────────────
  let lastFocused: Element | null = null;
  const openModal = (): void => {
    lastFocused = document.activeElement;
    show(el.csvModal);
    el.csvModal.querySelector<HTMLElement>('.modal-card')?.focus();
  };
  const closeModal = (): void => {
    hide(el.csvModal);
    (lastFocused as HTMLElement | null)?.focus?.();
  };

  // Importing the user's own export comes first; syncing reads the site.
  el.sync.addEventListener('click', openModal);
  el.importDna.addEventListener('click', openModal);
  el.refreshDna.addEventListener('click', () => void sync());
  byId('btnFullSync').addEventListener('click', () => void sync(true));
  for (const id of ['btnDismissCsvModal', 'btnCloseCsvModal']) byId(id).addEventListener('click', closeModal);
  byId('btnSelectCsvFromModal').addEventListener('click', () => {
    closeModal();
    el.csvInput.click();
  });
  el.csvModal.addEventListener('click', (event) => event.target === el.csvModal && closeModal());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !el.csvModal.classList.contains('hidden')) closeModal();
  });
  el.csvInput.addEventListener('change', () => {
    const files = [...(el.csvInput.files ?? [])];
    el.csvInput.value = '';
    void importCsv(files);
  });

  state.onOverview(renderSidebar);
  return { openImport: openModal };
}
