import { test } from 'vitest';
import assert from 'node:assert/strict';
import { html, joinHtml, safeUrl } from '../../src/ui/shared/html.ts';

test('HTML escaping protects text and attributes without escaping trusted nested markup', () => {
  const attack = '<img src=x onerror="alert(1)">';
  const output = String(html`<p title="${attack}">${attack}${joinHtml([html`<b>${'A&B'}</b>`])}</p>`);
  assert.ok(!output.includes('<img'));
  assert.ok(output.includes('&quot;'));
  assert.ok(output.includes('<b>A&amp;B</b>'));
  assert.equal(safeUrl('javascript:alert(1)'), 'https://letterboxd.com/');
  assert.equal(safeUrl('https://letterboxd.com/film/alien/'), 'https://letterboxd.com/film/alien/');
});
