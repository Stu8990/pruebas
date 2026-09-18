import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;

function jsFiles(dir) {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith('.js') ? [p] : [];
  });
}

test('el service worker precarga todos los módulos de src/ (si falta uno, la PWA offline se rompe)', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const shell = [...sw.matchAll(/BASE \+ '([^']+)'/g)].map(m => m[1]);
  for (const f of jsFiles(join(root, 'src'))) {
    const path = '/' + relative(root, f);
    assert.ok(shell.includes(path), `sw.js no incluye ${path}`);
  }
  for (const p of shell.filter(p => p.endsWith('.js'))) {
    assert.doesNotThrow(() => statSync(join(root, p)), `sw.js lista ${p}, que no existe`);
  }
});
