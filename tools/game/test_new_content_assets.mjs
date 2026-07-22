import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function transpileModule(sourceUrl, outputName) {
  const source = readFileSync(sourceUrl, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const directory = mkdtempSync(join(tmpdir(), 'northern-new-content-assets-'));
  const outputPath = join(directory, outputName);
  writeFileSync(outputPath, output, 'utf8');
  return import(pathToFileURL(outputPath).href);
}

function pngDimensions(url) {
  const png = readFileSync(url);
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG', `${url.pathname} must be a PNG`);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

const presentation = await transpileModule(
  new URL('../../src/game/tradePresentation.ts', import.meta.url),
  'tradePresentation.mjs',
);
const assets = await transpileModule(
  new URL('../../src/render/newContentAssets.ts', import.meta.url),
  'newContentAssets.mjs',
);
const centerAssets = await transpileModule(
  new URL('../../src/render/centerPromotionAssets.ts', import.meta.url),
  'centerPromotionAssets.mjs',
);

const expectedResources = [
  'eggs', 'milk', 'curedMeat', 'saltedFish',
  'driedFish', 'kimchi', 'beans', 'jang',
  'salt', 'onggi', 'wool', 'hay', 'silver',
];
const occupiedResourceCells = new Set();
for (const resource of expectedResources) {
  const sprite = presentation.RESOURCE_SPRITES[resource];
  assert.ok(sprite, `${resource} must have a dedicated resource sprite`);
  assert.equal(sprite.atlas, '/assets/resources/new-content-resource-atlas-v1.png');
  assert.equal(sprite.columns, 4);
  assert.equal(sprite.rows, 4);
  occupiedResourceCells.add(`${sprite.column},${sprite.row}`);
}
assert.equal(occupiedResourceCells.size, expectedResources.length,
  'new resources must not share atlas cells');

const buildingTypes = ['cellar', 'smokehouse', 'dryingRack', 'onggiKiln', 'jangdokdae', 'clinic', 'cemetery', 'school'];
for (const [column, type] of buildingTypes.entries()) {
  assert.equal(assets.isNewContentBuildingType(type), true, `${type} must use the new building sheet`);
  assert.deepEqual(assets.newContentBuildingSourceRect(type, 'summer'), {
    sx: column * 28, sy: 0, sw: 28, sh: 40,
  });
  assert.deepEqual(assets.newContentBuildingSourceRect(type, 'winter', true), {
    sx: column * 56, sy: 80, sw: 56, sh: 80,
  });
}
assert.equal(assets.newContentBuildingSourceRect('house', 'summer'), null);

assert.deepEqual(assets.newContentResidentSourceRect('idle', 'male', 'infant'), {
  sx: 0, sy: 0, sw: 28, sh: 40,
});
assert.deepEqual(assets.newContentResidentSourceRect('idle', 'female', 'infant'), {
  sx: 28, sy: 0, sw: 28, sh: 40,
});
assert.deepEqual(assets.newContentResidentSourceRect('idle', 'male', 'child'), {
  sx: 0, sy: 40, sw: 28, sh: 40,
});
assert.deepEqual(assets.newContentResidentSourceRect('idle', 'female', 'child'), {
  sx: 28, sy: 40, sw: 28, sh: 40,
});
assert.deepEqual(assets.newContentResidentSourceRect('undertaker', 'male'), {
  sx: 0, sy: 80, sw: 28, sh: 40,
});
assert.deepEqual(assets.newContentResidentSourceRect('undertaker', 'female'), {
  sx: 28, sy: 80, sw: 28, sh: 40,
});
assert.deepEqual(assets.newContentResidentSourceRect('teacher', 'male'), {
  sx: 0, sy: 120, sw: 28, sh: 40,
});
assert.deepEqual(assets.newContentResidentSourceRect('teacher', 'female'), {
  sx: 28, sy: 120, sw: 28, sh: 40,
});
for (const [index, job] of ['idle', 'hauler', 'farmer', 'woodSplitter', 'herder'].entries()) {
  assert.deepEqual(assets.newContentResidentSourceRect(job, 'male', 'youth'), {
    sx: 0, sy: (index + 4) * 40, sw: 28, sh: 40,
  });
  assert.deepEqual(assets.newContentResidentSourceRect(job, 'female', 'youth'), {
    sx: 28, sy: (index + 4) * 40, sw: 28, sh: 40,
  });
}
assert.equal(assets.newContentResidentSourceRect('teacher', 'male', 'youth'), null,
  'unsupported youth jobs must not fall back to an adult sprite');
assert.equal(assets.newContentResidentSourceRect('undertaker', 'male', 'child').sy, 40,
  'life stage must take priority over an accidental child job assignment');

assert.deepEqual(pngDimensions(new URL('../../public/assets/new-content-buildings-v2.png', import.meta.url)), [224, 80]);
assert.deepEqual(pngDimensions(new URL('../../public/assets/new-content-buildings-large-v2.png', import.meta.url)), [448, 160]);
assert.deepEqual(pngDimensions(new URL('../../public/assets/new-content-residents-v2.png', import.meta.url)), [56, 360]);
assert.deepEqual(pngDimensions(new URL('../../public/assets/resources/new-content-resource-atlas-v1.png', import.meta.url)), [1024, 1024]);
assert.deepEqual(pngDimensions(new URL('../../public/assets/center-promotions-generated-v1.png', import.meta.url)), [168, 160]);
assert.equal(centerAssets.centerPromotionSourceRect('settlement', 'summer'), null);
assert.deepEqual(centerAssets.centerPromotionSourceRect('bo', 'summer'), { sx: 0, sy: 0, sw: 56, sh: 80 });
assert.deepEqual(centerAssets.centerPromotionSourceRect('jin', 'winter'), { sx: 56, sy: 80, sw: 56, sh: 80 });
assert.deepEqual(centerAssets.centerPromotionSourceRect('bu', 'winter'), { sx: 112, sy: 80, sw: 56, sh: 80 });

const atlasSource = readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8');
const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
assert.match(atlasSource, /return loaded >= 44;/, 'atlas readiness must include all resident work sheets');
assert.match(atlasSource, /newContentResidentSourceRect\(p\.job, p\.gender, p\.stage\)/,
  'resident dispatch must choose the new sheet by life stage');
assert.doesNotMatch(rendererSource, /r\.stage === 'infant'\) continue/,
  'infants with dedicated sprites must no longer be hidden');
assert.match(rendererSource, /stage: r\.stage/, 'renderer must pass life stage to the sprite layer');

console.log('new content asset metadata tests passed');
