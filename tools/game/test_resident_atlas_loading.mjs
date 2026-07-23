import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileModules() {
  const srcRoot = new URL('../../src/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-atlas-loading-'));
  for (const dir of ['game', 'render']) {
    const srcDir = new URL(`${dir}/`, srcRoot);
    for (const file of readdirSync(srcDir).filter(name => name.endsWith('.ts'))) {
      const source = readFileSync(new URL(file, srcDir), 'utf8');
      let output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
        if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
        return `${start}${spec}.mjs${end}`;
      });
      const target = join(outDir, dir, file.replace(/\.ts$/, '.mjs'));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, output, 'utf8');
    }
  }
  return outDir;
}

class FakeImage {
  static bySrc = new Map();

  onload = null;
  onerror = null;
  _src = '';

  set src(value) {
    this._src = value;
    FakeImage.bySrc.set(value, this);
  }

  get src() { return this._src; }

  load() { this.onload?.(); }
  fail() { this.onerror?.(new Error(`failed: ${this._src}`)); }
}

function drawContext() {
  const images = [];
  return {
    images,
    imageSmoothingEnabled: false,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    beginPath() {},
    drawImage(image) { images.push(image); },
    ellipse() {},
    fillRect() {},
    fillText() {},
    restore() {},
    rotate() {},
    save() {},
    scale() {},
    stroke() {},
    strokeRect() {},
    translate() {},
  };
}

function residentParams(overrides = {}) {
  return {
    job: 'woodcutter', gender: 'male', x: 16, y: 16,
    sick: false, carrying: false, selected: false,
    moving: false, working: true, facing: 1, animationTimeMs: 260,
    ...overrides,
  };
}

globalThis.Image = FakeImage;
const compiledDir = compileModules();
const atlasUrl = pathToFileURL(join(compiledDir, 'render', 'atlas.mjs')).href;
const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => warnings.push(args.join(' '));

try {
  const atlas = await import(`${atlasUrl}?optional-failure`);
  assert.equal(atlas.getActiveSprites().id, 'placeholder', 'loading core assets keeps the safe placeholder');

  const initialStates = atlas.atlasAssetStateSnapshot();
  assert.ok(initialStates.some(asset => asset.required), 'the manifest marks core assets as required');
  assert.ok(initialStates.some(asset => !asset.required), 'the manifest marks resident work sheets as optional');
  assert.ok(!initialStates.some(asset => /resident-.*-v1\.png/.test(asset.src) && asset.required),
    'resident presentation sheets are never core requirements');

  const failedWorkSrc = '/assets/resident-woodcutter-work-v1.png';
  const lateHunterSrc = '/assets/resident-hunter-hunt-v1.png';
  for (const asset of initialStates) {
    if (asset.src === failedWorkSrc || asset.src === lateHunterSrc) continue;
    FakeImage.bySrc.get(asset.src).load();
  }
  FakeImage.bySrc.get(failedWorkSrc).fail();
  FakeImage.bySrc.get(failedWorkSrc).fail();

  assert.equal(atlas.atlasReady(), true, 'one optional sheet failure does not block the core atlas');
  assert.equal(atlas.getActiveSprites().id, atlas.atlasSprites.id,
    'active sprites use the atlas when core assets are ready');
  assert.equal(warnings.filter(message => message.includes(failedWorkSrc)).length, 1,
    'the same optional asset failure warns only once and names the file');

  const fallbackContext = drawContext();
  atlas.atlasSprites.drawResident(fallbackContext, residentParams());
  assert.equal(fallbackContext.images[0], FakeImage.bySrc.get('/assets/folk-characters-generated-v1.png'),
    'a missing woodcutter work sheet falls back to the generated resident, not another work sheet');

  let settledInvalidations = 0;
  const unsubscribe = atlas.onAtlasAssetSettled(() => { settledInvalidations++; });
  FakeImage.bySrc.get(lateHunterSrc).load();
  unsubscribe();
  assert.equal(settledInvalidations, 1, 'a late optional load requests exactly one render invalidation');

  const hunterContext = drawContext();
  atlas.atlasSprites.drawResident(hunterContext, residentParams({ job: 'hunter' }));
  assert.equal(hunterContext.images[0], FakeImage.bySrc.get(lateHunterSrc),
    'another loaded profession still uses its optional work sheet');

  FakeImage.bySrc = new Map();
  const coreFailureAtlas = await import(`${atlasUrl}?core-failure`);
  coreFailureAtlas.getActiveSprites();
  const coreStates = coreFailureAtlas.atlasAssetStateSnapshot();
  const failedCore = coreStates.find(asset => asset.required);
  assert.ok(failedCore);
  for (const asset of coreStates) {
    const image = FakeImage.bySrc.get(asset.src);
    if (asset.src === failedCore.src) image.fail();
    else image.load();
  }
  assert.equal(coreFailureAtlas.atlasReady(), false, 'a failed core asset preserves the existing safe fallback');
  assert.equal(coreFailureAtlas.getActiveSprites().id, 'placeholder');
} finally {
  console.warn = originalWarn;
}

console.log('resident atlas loading tests passed');
