import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Keeps new UI on the shared look: colours come from src/styles/theme.css tokens,
// styles live in src/styles, and vendored coss ui components are not edited by hand.
const root = join(import.meta.dirname, '..', 'src');
const vendored = join(root, 'components', 'ui');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
const appFiles = files(root).filter((path) => !path.startsWith(vendored));

test('app components use design tokens instead of raw colour values', () => {
  const offenders = appFiles
    .filter((path) => path.endsWith('.tsx') || path.endsWith('.ts'))
    .filter((path) =>
      /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\[#[0-9a-fA-F]/.test(
        readFileSync(path, 'utf8'),
      ),
    )
    .map((path) => relative(root, path));
  assert.deepEqual(offenders, [], 'Use a token from src/styles/theme.css instead.');
});

test('stylesheets live only in src/styles', () => {
  const stray = appFiles
    .filter((path) => path.endsWith('.css') && !path.startsWith(join(root, 'styles')))
    .map((path) => relative(root, path));
  assert.deepEqual(stray, []);
});

test('vendored coss ui components keep their registry formatting', () => {
  // The registry ships double quotes; a reformatted file would break later CLI updates.
  for (const path of files(vendored).filter((path) => path.endsWith('.tsx')))
    assert.match(readFileSync(path, 'utf8'), /from "/, `${relative(root, path)} was reformatted`);
});
