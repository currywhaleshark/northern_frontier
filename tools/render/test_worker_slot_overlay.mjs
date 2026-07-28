import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileModules() {
  const srcRoot = new URL('../../src/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-render-tests-'));
  const dirs = ['game', 'render'];

  for (const dir of dirs) {
    const srcDir = new URL(`${dir}/`, srcRoot);
    for (const file of readdirSync(srcDir).filter(name => name.endsWith('.ts'))) {
      const source = readFileSync(new URL(file, srcDir), 'utf8');
      let output = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ES2022,
          target: ts.ScriptTarget.ES2022,
        },
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

class FakeGradient {
  addColorStop() {}
}

class FakeContext {
  constructor(ops) {
    this.ops = ops;
    this.fillStyle = '';
    this.strokeStyle = '';
    this.lineWidth = 1;
    this.globalAlpha = 1;
    this.lineDashOffset = 0;
    this.imageSmoothingEnabled = false;
  }

  arc(x, y, radius) {
    this.ops.push({
      kind: 'arc',
      x,
      y,
      radius,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
    });
  }

  beginPath() {}
  clip() {}
  clearRect() {}
  closePath() {}
  drawImage() {}
  ellipse() {}
  fill() {}
  fillRect() {}
  fillText() {}
  lineTo() {}
  moveTo() {}
  rect() {}
  restore() {}
  save() {}
  setLineDash() {}
  setTransform(a, b, c, d, e, f) {
    this.ops.push({ kind: 'setTransform', a, b, c, d, e, f });
  }
  stroke() {}
  strokeRect() {}
  createRadialGradient() { return new FakeGradient(); }
}

function makeCanvas(ops, width = 180, height = 180) {
  return {
    width,
    height,
    getContext: () => new FakeContext(ops),
  };
}

function makeMap(width, height) {
  return Array.from({ length: height }, (_row, y) =>
    Array.from({ length: width }, (_col, x) => ({
      x,
      y,
      terrain: 'plain',
      hasIron: false,
      buildingId: null,
    })));
}

function makeResident(id, job, assignedBuildingId, x, y) {
  return {
    id,
    name: `Resident ${id}`,
    age: 24,
    gender: 'male',
    job,
    hunger: 100,
    warmth: 100,
    health: 100,
    morale: 70,
    skills: {},
    assignedBuildingId,
    task: '',
    alive: true,
    sick: false,
    x,
    y,
    px: x,
    py: y,
    phase: 'rest',
    path: [],
    workTimer: 0,
    targetId: null,
    carrying: {},
    manualOrder: null,
  };
}

globalThis.document = {
  createElement: () => makeCanvas([]),
};

const compiledDir = compileModules();
const { renderScene } = await import(pathToFileURL(join(compiledDir, 'render', 'renderer.mjs')).href);
const { JOB_COLORS } = await import(pathToFileURL(join(compiledDir, 'game', 'constants.mjs')).href);
const { newGame } = await import(pathToFileURL(join(compiledDir, 'game', 'simulation.mjs')).href);

const map = makeMap(8, 8);
const field = { id: 101, type: 'field', x: 2, y: 2, progress: 3, built: true, fieldGrowth: 60 };
const smithy = { id: 102, type: 'smithy', x: 4, y: 2, progress: 8, built: true, fieldGrowth: 0 };
map[field.y][field.x].buildingId = field.id;
for (let y = smithy.y; y < smithy.y + 2; y++) {
  for (let x = smithy.x; x < smithy.x + 2; x++) map[y][x].buildingId = smithy.id;
}

const state = newGame(12345);
Object.assign(state, {
  day: 1,
  subTick: 4,
  weather: 'clear',
  map,
  exploration: { explored: map.map(row => row.map(() => true)) },
  habitats: [],
  buildings: [field, smithy],
  residents: [
    makeResident(1, 'farmer', field.id, 1, 1),
    makeResident(2, 'smith', smithy.id, 5, 5),
  ],
  resources: {
    firewood: 0,
    gunpowder: 0,
    muskets: 0,
    hornBows: 0,
    spears: 0,
  },
  rank: 'bu',
  raiders: null,
  battle: null,
});

const ops = [];
const sprites = {
  id: 'worker-slot-test',
  drawTerrain() {},
  drawBuilding(_ctx, building) {
    ops.push({ kind: 'building', type: building.type });
  },
  drawResident(_ctx, resident) {
    ops.push({ kind: 'resident', job: resident.job });
  },
  drawRaiders() {},
};

renderScene(makeCanvas(ops), state, {
  alpha: 0,
  hover: null,
  placingType: null,
  selected: null,
  selectedResidentId: null,
  selectedBuildingId: field.id,
  sprites,
});

const fieldIndex = ops.findIndex(op => op.kind === 'building' && op.type === 'field');
const farmerIndex = ops.findIndex(op => op.kind === 'resident' && op.job === 'farmer');
const smithyIndex = ops.findIndex(op => op.kind === 'building' && op.type === 'smithy');
const smithIndex = ops.findIndex(op => op.kind === 'resident' && op.job === 'smith');
assert.ok(
  fieldIndex < farmerIndex,
  'tile-based fields stay on the ground layer below row-sorted actors',
);
assert.ok(
  farmerIndex < smithyIndex && smithyIndex < smithIndex,
  'world sprites interleave by row: upper resident, middle building, lower resident',
);

const lastBuildingIndex = Math.max(...ops.map((op, index) => op.kind === 'building' ? index : -1));
const lastResidentIndex = Math.max(...ops.map((op, index) => op.kind === 'resident' ? index : -1));
const lastWorldSpriteIndex = Math.max(lastBuildingIndex, lastResidentIndex);
const slotArcs = ops
  .map((op, index) => ({ ...op, index }))
  .filter(op => op.kind === 'arc' && op.index > lastWorldSpriteIndex);

assert.ok(slotArcs.length >= 3, 'slotted buildings draw UI overlay arcs above the row-sorted world queue');
assert.ok(
  slotArcs.some(op => op.radius >= 4 && op.fillStyle === JOB_COLORS.farmer),
  'selected filled field slot draws an expanded badge using the worker job color',
);
assert.ok(
  slotArcs.some(op => op.radius > 1.5 && op.radius < 4),
  'unselected slotted building draws compact dots',
);

const hdOps = [];
renderScene(makeCanvas(hdOps, 360, 360), state, {
  alpha: 0,
  animationTimeMs: 0,
  hover: null,
  placingType: null,
  selected: null,
  selectedResidentId: null,
  selectedBuildingId: field.id,
  renderScale: 2,
  viewport: {
    pixelX: 0,
    pixelY: 0,
    pixelWidth: 180,
    pixelHeight: 180,
    tileMinX: 0,
    tileMinY: 0,
    tileMaxX: 7,
    tileMaxY: 7,
  },
  sprites,
});
assert.deepEqual(
  hdOps.find(op => op.kind === 'setTransform'),
  { kind: 'setTransform', a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 },
  '2x zoom renders logical scene coordinates into a doubled backing canvas',
);

console.log('worker slot overlay tests passed');
