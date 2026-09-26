import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// Enforces the dependency rule described in docs/architecture.md.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

type Layer = 'domain' | 'application' | 'infrastructure' | 'messaging' | 'background' | 'ui' | 'data';

interface Import {
  target: string;
  typeOnly: boolean;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

function layerOf(file: string): Layer {
  return relative(SRC, file).split('/')[0] as Layer;
}

function importsOf(file: string): Import[] {
  const source = readFileSync(file, 'utf8');
  const imports: Import[] = [];
  const pattern = /^\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/gm;
  for (const match of source.matchAll(pattern)) {
    const [, , typeKeyword, clause, specifier] = match;
    if (!specifier.startsWith('.')) continue;
    // `import { type A, type B }` is erased like `import type { A, B }`.
    const names = clause.replace(/[{}]/g, '').split(',').map((name) => name.trim()).filter(Boolean);
    const typeOnly = Boolean(typeKeyword) || (names.length > 0 && names.every((name) => name.startsWith('type ')));
    imports.push({ target: resolve(dirname(file), specifier), typeOnly });
  }
  for (const match of source.matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    imports.push({ target: resolve(dirname(file), match[1]), typeOnly: false });
  }
  return imports;
}

/** Layers each layer may import at runtime; type-only imports are listed separately. */
const RUNTIME: Record<Layer, Layer[]> = {
  domain: ['domain'],
  application: ['domain', 'application'],
  infrastructure: ['domain', 'infrastructure', 'data'],
  messaging: ['messaging'],
  background: ['domain', 'application', 'infrastructure', 'messaging', 'background'],
  ui: ['domain', 'messaging', 'ui'],
  data: ['data'],
};
const TYPES: Record<Layer, Layer[]> = {
  domain: [],
  application: [],
  infrastructure: ['application'],
  messaging: ['domain', 'application'],
  background: [],
  ui: ['application'],
  data: ['domain'],
};

const files = sourceFiles(SRC);

describe('dependency rule', () => {
  for (const file of files) {
    const layer = layerOf(file);
    test(relative(ROOT, file), () => {
      const violations = importsOf(file)
        .filter((dependency) => dependency.target.startsWith(SRC))
        .filter((dependency) => {
          const target = layerOf(dependency.target);
          return !RUNTIME[layer].includes(target) && !(dependency.typeOnly && TYPES[layer].includes(target));
        })
        .map((dependency) => `${relative(SRC, dependency.target)}${dependency.typeOnly ? ' (type)' : ''}`);
      expect(violations, `${layer} must not import these`).toEqual([]);
    });
  }
});

describe('platform access stays at the edges', () => {
  const PLATFORM = /\bchrome\.|\bfetch\(|\bdocument\.|\bwindow\.|\bnavigator\.|localStorage/;
  for (const file of files.filter((path) => ['domain', 'application'].includes(layerOf(path)))) {
    test(relative(ROOT, file), () => {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code).not.toMatch(PLATFORM);
    });
  }
});

test('only the infrastructure loads the generated catalog data', () => {
  const loaders = files.filter((file) => importsOf(file).some((dependency) => !dependency.typeOnly && layerOf(dependency.target) === 'data'));
  expect(loaders.map((file) => relative(SRC, file))).toEqual(['infrastructure/catalog.ts']);
});
