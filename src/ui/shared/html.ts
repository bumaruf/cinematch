/** HTML that was already escaped; interpolating it does not escape again. */
export class Markup {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

/** Tagged template that escapes every interpolated value except Markup. */
export function html(parts: TemplateStringsArray, ...values: unknown[]): Markup {
  return new Markup(
    parts.reduce(
      (out, part, i) =>
        out + part + (i < values.length ? (values[i] instanceof Markup ? values[i].value : escapeHtml(values[i])) : ''),
      '',
    ),
  );
}

export function joinHtml(parts: readonly unknown[]): Markup {
  return new Markup(parts.map((value) => (value instanceof Markup ? value.value : escapeHtml(value))).join(''));
}

/** Only http(s) URLs; anything else (javascript:, data:) becomes the fallback. */
export function safeUrl(value: unknown, fallback = 'https://letterboxd.com/'): string {
  try {
    const url = new URL(String(value));
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch {
    // Not a URL.
  }
  return fallback;
}

/** Sets element.innerHTML from escaped markup only. */
export function render(element: Element, markup: Markup): void {
  element.innerHTML = markup.value;
}
