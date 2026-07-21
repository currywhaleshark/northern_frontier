import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/tacticalBackgroundAssets.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-background-assets-'));
const modulePath = join(outDir, 'tacticalBackgroundAssets.mjs');
writeFileSync(modulePath, output, 'utf8');
const assets = await import(pathToFileURL(modulePath).href);

const sectors = [
  ['huntSectorRidge', 'ridge'],
  ['huntSectorBrook', 'brook'],
  ['huntSectorRavine', 'ravine'],
];
const seasons = ['spring', 'summer', 'autumn', 'winter'];
const defenseKinds = ['approach', 'wall', 'storehouse', 'center'];

for (const season of seasons) {
  for (const kind of defenseKinds) {
    const assetUrl = new URL(`../../public/assets/tactical/${kind}-night-${season}-v1.webp`, import.meta.url);
    assert.equal(existsSync(assetUrl), true, `${kind} ${season} night background must exist`);
    assert.ok(statSync(assetUrl).size > 100_000, `${kind} ${season} night background must not be empty`);
  }
}

for (const season of seasons) {
  const paths = sectors.map(([zoneId, family], order) => {
    const background = assets.tacticalBackgroundAsset('forest', season, 'predatorHunt', order, zoneId);
    assert.deepEqual(background, {
      src: `/assets/tactical/offensive-backgrounds/hunt-${family}-${season}-v2.webp`,
      size: 'cover',
      position: 'center center',
    });
    return background.src;
  });
  assert.equal(new Set(paths).size, 3, `${season} hunt sectors must use independent backgrounds`);
}

assert.deepEqual(assets.tacticalBackgroundAsset('forest', 'winter', 'predatorHunt', 1, 'huntDen'), {
  src: '/assets/tactical/offensive-backgrounds/hunt-panorama-winter-v1.webp',
  size: '200% 100%',
  position: 'center center',
});
assert.deepEqual(assets.tacticalBackgroundAsset('wall', 'summer', 'banditLair', 2, 'lairWall'), {
  src: '/assets/tactical/offensive-backgrounds/bandit-panorama-summer-v1.webp',
  size: '200% 100%',
  position: 'right center',
});
assert.deepEqual(assets.tacticalBackgroundAsset('wall', 'autumn', undefined, 1, 'villageWall', true), {
  src: '/assets/tactical/wall-night-autumn-v1.webp',
});

console.log('tactical background asset tests passed');
