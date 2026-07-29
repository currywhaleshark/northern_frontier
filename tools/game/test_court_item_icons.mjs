import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

async function transpileStandalone(sourceUrl, outputName) {
  const source = readFileSync(sourceUrl, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const directory = mkdtempSync(join(tmpdir(), 'northern-court-item-icons-'));
  const outputPath = join(directory, outputName);
  writeFileSync(outputPath, output, 'utf8');
  return import(pathToFileURL(outputPath).href);
}

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-court-item-game-modules-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

function pngDimensions(url) {
  const png = readFileSync(url);
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

const compiledGameDir = compileGameModules();
const presentation = await import(
  pathToFileURL(join(compiledGameDir, 'tradePresentation.mjs')).href
);
const specialItems = await import(
  pathToFileURL(join(compiledGameDir, 'specialItems.mjs')).href
);
const iconAssets = await transpileStandalone(
  new URL('../../src/ui/uiIconAssets.ts', import.meta.url),
  'uiIconAssets.mjs',
);

const atlas = '/assets/ui/court-item-icons-v1.png';
assert.deepEqual(
  pngDimensions(new URL('../../public/assets/ui/court-item-icons-v1.png', import.meta.url)),
  [512, 512],
);
assert.deepEqual(presentation.RESOURCE_SPRITES.strawShoes, {
  atlas, columns: 4, rows: 4, column: 0, row: 0,
});
assert.deepEqual(presentation.RESOURCE_SPRITES.leatherShoes, {
  atlas, columns: 4, rows: 4, column: 1, row: 0,
});

const expected = {
  reliefGrainVoucher: ['grantReliefVoucher', 2, 0],
  tributeWaiverDecree: ['grantWaiverDecree', 3, 0],
  recruitmentNotice: ['grantRecruitmentNotice', 0, 1],
  rainGauge: ['grantRainGauge', 1, 1],
  agriculturalEdict: ['grantAgriculturalEdict', 2, 1],
  medicalBook: ['grantMedicalBook', 3, 1],
  militaryTreatise: ['grantMilitaryTreatise', 0, 2],
  telescope: ['grantTelescope', 1, 2],
  royalPlaque: ['grantRoyalPlaque', 2, 2],
  jijaChongtong: ['grantJijaChongtong', 3, 2],
  royalSpear: ['grantRoyalSpear', 0, 3],
  royalHornBow: ['grantRoyalHornBow', 1, 3],
  royalMusket: ['grantRoyalMusket', 2, 3],
};

const occupiedCells = new Set(['0,0', '1,0']);
for (const [item, [icon, column, row]] of Object.entries(expected)) {
  assert.equal(specialItems.SPECIAL_ITEM_DEFS[item].icon, icon, `${item} uses its dedicated icon`);
  assert.deepEqual(iconAssets.UI_ICON_FRAMES[icon], { atlas, column, row });
  occupiedCells.add(`${column},${row}`);
}
assert.equal(occupiedCells.size, 15, 'all footwear and court-grant icons use distinct cells');
assert.equal(occupiedCells.has('3,3'), false, 'the final atlas cell remains reserved and empty');

const actionPopup = readFileSync(
  new URL('../../src/components/ActionPopup.tsx', import.meta.url),
  'utf8',
);
assert.match(actionPopup, /grantRoyalPlaque[\s\S]*사액 현판/);

console.log('court item icon tests passed');
