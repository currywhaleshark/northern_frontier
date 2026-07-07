import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const assetPath = join(process.cwd(), 'public', 'assets', 'main-menu-background.png');
const cssPath = join(process.cwd(), 'src', 'styles', 'global.css');
const css = readFileSync(cssPath, 'utf8');

assert.equal(existsSync(assetPath), true, 'main menu background asset exists');
assert.ok(
  css.includes("url('/assets/main-menu-background.png')"),
  'main menu CSS references the background asset',
);
assert.match(
  css,
  /\.main-menu\s*\{[\s\S]*background:[\s\S]*linear-gradient[\s\S]*url\('\/assets\/main-menu-background\.png'\)/,
  'main menu background keeps an overlay layer above the image',
);

console.log('main menu background tests passed');
