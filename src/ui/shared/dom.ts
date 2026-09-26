/** Element that the page's HTML must contain; fails loudly when it does not. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento #${id} não encontrado.`);
  return element as T;
}

export function show(element: Element | null | undefined, visible = true): void {
  element?.classList.toggle('hidden', !visible);
}

export function hide(element: Element | null | undefined): void {
  show(element, false);
}

export function onReady(fn: () => void | Promise<void>): void {
  const run = (): void => {
    Promise.resolve(fn()).catch((error: unknown) => console.error('[CineMatch]', error));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}

/** Copies text and briefly shows a confirmation on the button. */
export async function copyWithFeedback(button: HTMLElement, text: string, done = '✓ Copiado!'): Promise<void> {
  await navigator.clipboard.writeText(text);
  const original = button.textContent;
  button.textContent = done;
  setTimeout(() => {
    button.textContent = original;
  }, 2000);
}
