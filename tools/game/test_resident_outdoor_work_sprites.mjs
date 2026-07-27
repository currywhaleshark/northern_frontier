import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const assetSource = readFileSync(
  new URL('../../src/render/residentOutdoorWorkAssets.ts', import.meta.url),
  'utf8',
);
const assetOutput = ts.transpileModule(assetSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const assetModuleUrl = `data:text/javascript;base64,${Buffer.from(assetOutput).toString('base64')}`;
const assets = await import(assetModuleUrl);

assert.equal(
  assets.RESIDENT_WORK_PRESENTATION_SCALE,
  1.16,
  'stationary work sprites compensate for tool-inclusive source framing',
);
assert.deepEqual(
  assets.RESIDENT_WORK_PRESENTATION_SCALE_BY_JOB,
  {
    woodSplitter: 1.12,
    miner: 1.2,
    hunter: 1.05,
  },
  'only work sheets with visibly undersized residents receive extra scale correction',
);

const wideWorkSheets = [
  ['FISHER', 'resident-fisher-work'],
  ['HERDER', 'resident-herder-work'],
  ['CHARCOAL_BURNER', 'resident-charcoal-burner-work'],
  ['POWDER_MAKER', 'resident-powder-maker-work'],
  ['UNDERTAKER', 'resident-undertaker-work'],
  ['CURER', 'resident-curer-work'],
  ['POTTER', 'resident-potter-work'],
];

for (const [constantName, filename] of wideWorkSheets) {
  const standard = assets[`RESIDENT_${constantName}_WORK_SHEET`];
  const highDefinition = assets[`RESIDENT_${constantName}_WORK_HD_SHEET`];
  assert.equal(standard.frameSize, 64, `${constantName} uses a wide standard prop cell`);
  assert.equal(highDefinition.frameSize, 128, `${constantName} has an exact 2x HD cell`);
  assert.equal(standard.displayFrameSize, 40, `${constantName} keeps normal resident display scale`);
  assert.equal(standard.frameDurationMs, 200, `${constantName} work runs at 5fps`);
  assert.equal(standard.src, `/assets/${filename}-v1.png`);
  assert.equal(highDefinition.src, `/assets/${filename}-hd-v1.png`);

  const standardPng = readFileSync(new URL(`../../public/assets/${filename}-v1.png`, import.meta.url));
  const hdPng = readFileSync(new URL(`../../public/assets/${filename}-hd-v1.png`, import.meta.url));
  assert.equal(standardPng.readUInt32BE(16), 256, `${filename} has four 64px columns`);
  assert.equal(standardPng.readUInt32BE(20), 128, `${filename} has two gender rows`);
  assert.equal(hdPng.readUInt32BE(16), 512, `${filename} HD has four 128px columns`);
  assert.equal(hdPng.readUInt32BE(20), 256, `${filename} HD has two gender rows`);
}

assert.equal(assets.RESIDENT_WOOD_SPLITTER_WORK_SHEET.frameDurationMs, 200);
assert.equal(assets.RESIDENT_WOOD_SPLITTER_WORK_HD_SHEET.frameSize, 80);
assert.deepEqual(
  assets.woodSplitterWorkSourceRect('female', 400, true),
  { sx: 160, sy: 80, sw: 80, sh: 80 },
);
assert.deepEqual(
  assets.fisherWorkSourceRect('female', 400, true),
  { sx: 256, sy: 128, sw: 128, sh: 128 },
);
assert.deepEqual(
  assets.undertakerWorkSourceRect('male', 600),
  { sx: 192, sy: 0, sw: 64, sh: 64 },
);

const atlasSource = readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8');
for (const job of [
  'woodSplitter',
  'fisher',
  'herder',
  'charcoalBurner',
  'powderMaker',
  'undertaker',
  'curer',
  'potter',
]) {
  assert.match(
    atlasSource,
    new RegExp(`case ['"]${job}['"]:\\s*if \\(p\\.working && !p\\.moving\\)`),
    `${job} uses its work sheet only while stationary and working`,
  );
}
assert.match(
  atlasSource,
  /standardTextureScale \* 0\.5/,
  'wide prop sheets preserve resident body scale in HD mode',
);
assert.match(
  atlasSource,
  /standardTextureScale \* RESIDENT_WORK_PRESENTATION_SCALE/,
  'stationary work sprites share the presentation-scale correction',
);
assert.match(
  atlasSource,
  /RESIDENT_WORK_PRESENTATION_SCALE_BY_JOB\[p\.job\] \?\? 1/,
  'stationary work sprites apply the optional per-job size correction',
);

const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
assert.match(
  rendererSource,
  /r\.job === ['"]undertaker['"] && r\.task === ['"]묘지 돌봄['"]/,
  'stationary cemetery care is forwarded as a visible undertaker work state',
);

console.log('resident outdoor work sprite tests passed');
