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
  const renderSrc = new URL('render/', srcRoot);
  for (const file of readdirSync(renderSrc).filter(name => name.endsWith('.json'))) {
    const source = readFileSync(new URL(file, renderSrc), 'utf8');
    const target = join(outDir, 'render', `${file}.mjs`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `export default ${source.trim()};\n`, 'utf8');
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

function drawContext(backingScale = 1) {
  const images = [];
  const drawCalls = [];
  return {
    images,
    drawCalls,
    imageSmoothingEnabled: false,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    getTransform() { return { a: backingScale, b: 0, c: 0, d: backingScale, e: 0, f: 0 }; },
    beginPath() {},
    drawImage(image, ...args) {
      images.push(image);
      drawCalls.push({ image, args });
    },
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
  assert.equal(
    initialStates.find(asset => asset.src === '/assets/resident-woodcutter-video-walk-v2.png')?.required,
    false,
    'the video-derived woodcutter walk is optional presentation',
  );
  assert.equal(
    initialStates.find(asset => asset.src === '/assets/resident-woodcutter-video-walk-hd-v2.png')?.required,
    false,
    'the HD woodcutter walk is optional presentation',
  );
  assert.equal(
    initialStates.find(asset => asset.src === '/assets/resident-woodcutter-video-work-v2.png')?.required,
    false,
    'the video-derived woodcutter work is optional presentation',
  );
  assert.equal(
    initialStates.find(asset => asset.src === '/assets/resident-woodcutter-video-work-hd-v2.png')?.required,
    false,
    'the HD woodcutter work is optional presentation',
  );

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
  assert.equal(fallbackContext.images[0], FakeImage.bySrc.get('/assets/resident-woodcutter-video-work-v2.png'),
    'the new video-derived work presentation replaces a missing legacy work sheet');
  assert.deepEqual(
    fallbackContext.drawCalls[0].args.slice(0, 4),
    [28, 0, 28, 40],
    'a working woodcutter uses the second chop frame at 260 ms',
  );

  const highDefinitionWorkContext = drawContext(2);
  atlas.atlasSprites.drawResident(highDefinitionWorkContext, residentParams());
  assert.equal(
    highDefinitionWorkContext.images[0],
    FakeImage.bySrc.get('/assets/resident-woodcutter-video-work-hd-v2.png'),
    'a working woodcutter uses the HD work source on the 2x backing canvas',
  );
  assert.deepEqual(
    highDefinitionWorkContext.drawCalls[0].args.slice(0, 4),
    [56, 0, 56, 80],
    'the HD work presentation samples the matching second frame',
  );

  const femaleFollowThroughContext = drawContext();
  atlas.atlasSprites.drawResident(femaleFollowThroughContext, residentParams({
    gender: 'female', animationTimeMs: 280,
  }));
  assert.deepEqual(
    femaleFollowThroughContext.drawCalls[0].args.slice(0, 4),
    [56, 40, 28, 40],
    'a working female woodcutter reaches the low follow-through frame',
  );

  let settledInvalidations = 0;
  const unsubscribe = atlas.onAtlasAssetSettled(() => { settledInvalidations++; });
  FakeImage.bySrc.get(lateHunterSrc).load();
  unsubscribe();
  assert.equal(settledInvalidations, 1, 'a late optional load requests exactly one render invalidation');

  const hunterContext = drawContext();
  atlas.atlasSprites.drawResident(hunterContext, residentParams({ job: 'hunter' }));
  assert.equal(hunterContext.images[0], FakeImage.bySrc.get(lateHunterSrc),
    'another loaded profession still uses its optional work sheet');

  const woodcutterWalkingContext = drawContext();
  atlas.atlasSprites.drawResident(woodcutterWalkingContext, residentParams({
    moving: true, working: false, animationTimeMs: 260,
  }));
  assert.equal(
    woodcutterWalkingContext.images[0],
    FakeImage.bySrc.get('/assets/resident-woodcutter-video-walk-v2.png'),
    'a moving adult woodcutter uses the standard video-derived axe walk',
  );
  assert.deepEqual(
    woodcutterWalkingContext.drawCalls[0].args.slice(0, 4),
    [28, 0, 28, 40],
    'the axe walk advances to its second frame at 260 ms',
  );

  const standingFemaleWoodcutterContext = drawContext();
  atlas.atlasSprites.drawResident(standingFemaleWoodcutterContext, residentParams({
    gender: 'female', moving: false, working: false, animationTimeMs: 600,
  }));
  assert.deepEqual(
    standingFemaleWoodcutterContext.drawCalls[0].args.slice(0, 4),
    [0, 40, 28, 40],
    'a standing female woodcutter holds the first axe frame',
  );

  const loadedFemaleWoodcutterContext = drawContext();
  atlas.atlasSprites.drawResident(loadedFemaleWoodcutterContext, residentParams({
    gender: 'female', moving: true, working: false, carryingWood: true, animationTimeMs: 600,
  }));
  assert.deepEqual(
    loadedFemaleWoodcutterContext.drawCalls[0].args.slice(0, 4),
    [56, 120, 28, 40],
    'a loaded female woodcutter uses the fourth jige frame at 600 ms',
  );

  const highDefinitionWoodcutterContext = drawContext(2);
  atlas.atlasSprites.drawResident(highDefinitionWoodcutterContext, residentParams({
    moving: true, working: false, animationTimeMs: 260,
  }));
  assert.equal(
    highDefinitionWoodcutterContext.images[0],
    FakeImage.bySrc.get('/assets/resident-woodcutter-video-walk-hd-v2.png'),
    'a moving woodcutter uses the 56x80 source on the 2x backing canvas',
  );
  assert.deepEqual(
    highDefinitionWoodcutterContext.drawCalls[0].args.slice(0, 4),
    [56, 0, 56, 80],
    'the HD axe walk uses the matching second frame',
  );

  const commonWalkingContext = drawContext();
  atlas.atlasSprites.drawResident(commonWalkingContext, residentParams({
    job: 'idle', moving: true, working: false,
  }));
  assert.equal(
    commonWalkingContext.images[0],
    FakeImage.bySrc.get('/assets/resident-idle-video-walk-v1.png'),
    'a moving unemployed adult uses the standard video-derived walk at normal zoom',
  );

  const highDefinitionIdleContext = drawContext(2);
  atlas.atlasSprites.drawResident(highDefinitionIdleContext, residentParams({
    job: 'idle', moving: true, working: false,
  }));
  assert.equal(
    highDefinitionIdleContext.images[0],
    FakeImage.bySrc.get('/assets/resident-idle-video-walk-hd-v1.png'),
    'a moving unemployed adult uses the 56x80 source on the 2x backing canvas',
  );

  const standingIdleContext = drawContext();
  atlas.atlasSprites.drawResident(standingIdleContext, residentParams({
    job: 'idle', gender: 'female', moving: false, working: false, animationTimeMs: 600,
  }));
  assert.equal(
    standingIdleContext.images[0],
    FakeImage.bySrc.get('/assets/resident-idle-video-walk-v1.png'),
    'a standing unemployed adult keeps the new standard-resolution presentation',
  );
  assert.deepEqual(
    standingIdleContext.drawCalls[0].args.slice(0, 4),
    [0, 40, 28, 40],
    'a standing unemployed woman holds the first atlas frame instead of animating',
  );

  const highDefinitionStandingIdleContext = drawContext(2);
  atlas.atlasSprites.drawResident(highDefinitionStandingIdleContext, residentParams({
    job: 'idle', gender: 'female', moving: false, working: false, animationTimeMs: 600,
  }));
  assert.equal(
    highDefinitionStandingIdleContext.images[0],
    FakeImage.bySrc.get('/assets/resident-idle-video-walk-hd-v1.png'),
    'a standing unemployed adult keeps the HD presentation on the 2x backing canvas',
  );
  assert.deepEqual(
    highDefinitionStandingIdleContext.drawCalls[0].args.slice(0, 4),
    [0, 80, 56, 80],
    'a standing unemployed woman holds the first HD atlas frame',
  );

  const youthWalkingContext = drawContext();
  atlas.atlasSprites.drawResident(youthWalkingContext, residentParams({
    job: 'idle', moving: true, working: false, stage: 'youth',
  }));
  assert.equal(
    youthWalkingContext.images[0],
    FakeImage.bySrc.get('/assets/new-content-residents-v2.png'),
    'common adult walking never replaces the youth presentation',
  );

  const undertakerWalkingContext = drawContext();
  atlas.atlasSprites.drawResident(undertakerWalkingContext, residentParams({
    job: 'undertaker', moving: true, working: false,
  }));
  assert.equal(
    undertakerWalkingContext.images[0],
    FakeImage.bySrc.get('/assets/resident-common-locomotion-v1.png'),
    'adult new-content jobs can walk instead of remaining on their static portrait',
  );

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
