import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileModules() {
  const srcRoot = new URL('../../src/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-resident-presentation-'));
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

const compiledDir = compileModules();
const presentationModule = await import(pathToFileURL(join(compiledDir, 'render', 'residentPresentation.mjs')).href);
const renderer = await import(pathToFileURL(join(compiledDir, 'render', 'renderer.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'game', 'config.mjs')).href);

const smithy = { id: 10, type: 'smithy', built: true, x: 4, y: 4 };
const charcoal = { id: 20, type: 'charcoalKiln', built: true, x: 6, y: 4 };
const field = { id: 30, type: 'field', built: true, x: 8, y: 4, plowOxen: 1 };
const resident = (id, job, assignedBuildingId, x, y, overrides = {}) => ({
  id, alive: true, job, stage: null, special: undefined, sick: false,
  phase: 'working', assignedBuildingId, task: '', carrying: {}, path: [],
  x, y, px: x, py: y, ...overrides,
});
const state = {
  buildings: [smithy, charcoal, field],
  residents: [
    resident(1, 'smith', smithy.id, 4, 4),
    resident(2, 'smith', smithy.id, 4, 4, { px: 3 }),
    resident(3, 'smith', smithy.id, 4, 4, { phase: 'rest' }),
    resident(4, 'woodcutter', charcoal.id, 6, 4),
    resident(5, 'farmer', field.id, 8, 4, { task: '조 재배 중' }),
  ],
};

const cache = presentationModule.createResidentPresentationSnapshotCache();
const first = cache.get(state, 10);
assert.equal(cache.get(state, 10), first, 'the same simulation version reuses one snapshot');
assert.equal(first.buildingById.get(smithy.id), smithy);
assert.deepEqual([...first.indoorResidentIds], [1], 'only stationary active interior workers are hidden');
assert.equal(first.workplaceActiveCountByBuilding.get(smithy.id), 1);
assert.equal(first.workplaceActiveCountByBuilding.get(charcoal.id), 1, 'yard activity remains active');
assert.ok(first.workStances.has(4), 'yard workers keep a visible work stance');
assert.ok(first.workStances.has(5), 'visible field workers keep a visible work stance');
assert.ok(first.oxPlowFarmerIds.has(5));

const tile = CONFIG.ui.tileSize;
const smithX = 4 * tile + tile / 2;
const smithY = 4 * tile + tile / 2;
assert.equal(renderer.findResidentAt(state, smithX, smithY, 1, 3, first), null,
  'the hidden smith cannot be clicked on the map');

const movingX = 3 * tile + tile / 2;
const movingY = 4 * tile + tile / 2;
assert.equal(renderer.findResidentAt(state, movingX, movingY, 0, 12, first)?.id, 2,
  'an interior assignee remains clickable while moving');
assert.equal(renderer.findResidentAt(state, smithX, smithY, 1, 18, first)?.id, 3,
  'a resting interior assignee remains visible and clickable');

const yardStance = first.workStances.get(4);
const yardPos = renderer.residentPixelPos(state.residents[3], 1, yardStance);
assert.equal(renderer.findResidentAt(state, yardPos.x, yardPos.y, 1, 3, first)?.id, 4,
  'yard hit testing uses the same work stance as rendering');

state.residents[0].assignedBuildingId = charcoal.id;
assert.equal(cache.get(state, 10), first, 'mutable state alone does not bypass the explicit simulation version');
const changed = cache.get(state, 11);
assert.notEqual(changed, first, 'assignment changes are observed after the simulation version advances');
assert.equal(changed.indoorResidentIds.has(1), false);
assert.equal(cache.get(state, 11), changed, 'alpha, hover, and other canvas-only changes reuse the snapshot');

const newGameState = { ...state, buildings: [...state.buildings], residents: [...state.residents] };
assert.notEqual(cache.get(newGameState, 11), changed, 'new-game or load state identity invalidates the cache');

console.log('resident presentation snapshot tests passed');
