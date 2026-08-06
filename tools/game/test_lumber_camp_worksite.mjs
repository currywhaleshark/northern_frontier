import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-lumber-camp-worksite-tests-'));
  for (const file of readdirSync(srcDir).filter(name => name.endsWith('.ts'))) {
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

const compiledDir = compileGameModules();
const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);
const simulation = await load('simulation');
const gatheringZones = await load('gatheringZones');
const workerSlots = await load('workerSlots');
const inventory = await load('inventory');
const { CONFIG } = await load('config');

const agentsSource = readFileSync(new URL('../../src/game/agents.ts', import.meta.url), 'utf8');
assert.equal(CONFIG.production.lumberCampBonus, 1.4,
  'the lumber camp keeps its intended forty-percent production bonus');
assert.match(
  agentsSource,
  /yieldAmt:\s*a\.yields\.wood\s*\*\s*CONFIG\.production\.lumberCampBonus\s*\*\s*CONFIG\.seasons\.woodMult/,
  'assigned lumber-camp woodcutters must apply the configured production bonus before seasonal output',
);

const state = simulation.newGame(2026080201);
state.exploration = { explored: state.map.map(row => row.map(() => true)) };
state.pendingChoice = null;
const x = 12;
const y = 12;
const radius = CONFIG.gatheringZones.lumberCampRadius;

for (let ty = y - radius - 2; ty <= y + radius + 2; ty++) {
  for (let tx = x - radius - 2; tx <= x + radius + 2; tx++) {
    const tile = state.map[ty]?.[tx];
    if (!tile || tile.buildingId != null) continue;
    tile.terrain = 'plain';
    delete tile.treeStage;
  }
}

const campTile = state.map[y][x];
campTile.terrain = 'plain';
campTile.buildingId = null;
const camp = {
  id: state.nextBuildingId++, type: 'lumberCamp', x, y,
  progress: 99, built: true, fieldGrowth: 0,
};
state.buildings.push(camp);
campTile.buildingId = camp.id;

const insidePoints = [
  [x + 1, y], [x + 2, y], [x + 3, y],
  [x + 1, y + 1], [x + 2, y + 1], [x + 3, y + 1],
];
const insideTrees = insidePoints.map(([tx, ty]) => state.map[ty][tx]);
for (const tree of insideTrees) {
  tree.terrain = 'forest';
  tree.treeStage = 'mature';
  tree.buildingId = null;
}
const inside = insideTrees[0];
const outside = state.map[y][x + radius + 1];
outside.terrain = 'forest';
outside.treeStage = 'mature';
outside.buildingId = null;

assert.equal(gatheringZones.adjustLumberCampWorkArea(state, camp.id, 2, 0, -2), null);
assert.deepEqual(gatheringZones.lumberCampWorkArea(camp), { x: x + 2, y, radius: radius - 2 });

assert.equal(gatheringZones.isTileInLumberCampWorkArea(camp, inside), true);
assert.equal(gatheringZones.isTileInLumberCampWorkArea(camp, outside), false);
assert.deepEqual(gatheringZones.lumberCampForestSummary(state, camp), {
  forestTiles: insideTrees.length,
  matureTrees: insideTrees.length,
});

const woodcutter = state.residents[0];
for (const resident of state.residents) resident.alive = resident.id === woodcutter.id;
Object.assign(woodcutter, {
  alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
  job: 'woodcutter', x, y, px: x, py: y, phase: 'rest', path: [], workTimer: 0,
  targetId: null, carrying: {}, assignedBuildingId: null, haulTask: null, manualOrder: null,
});
assert.equal(workerSlots.assignResidentToBuilding(state, woodcutter.id, camp.id), null);

const originalDepleteChance = CONFIG.agents.forestDepleteChance;
const originalWoodCapacity = CONFIG.agents.carryCap.wood;
CONFIG.agents.forestDepleteChance = 1;
CONFIG.agents.carryCap.wood = 0.01;
for (let tick = 0; tick < CONFIG.agents.subticksPerDay * 6; tick++) {
  state.pendingChoice = null;
  simulation.advanceTick(state);
}
CONFIG.agents.forestDepleteChance = originalDepleteChance;
CONFIG.agents.carryCap.wood = originalWoodCapacity;

assert.ok(insideTrees.some(tree => tree.treeStage === 'stump'),
  'assigned woodcutter harvests mature trees inside the camp area');
assert.equal(outside.treeStage, 'mature', 'assigned woodcutter never harvests outside the camp area');
assert.ok(inventory.buildingStock(camp, 'wood') > 0, 'assigned woodcutter unloads at the assigned camp');

// 건설 예정지 개간은 벌목장 영역 밖이어도 일반 벌목 제한보다 먼저 처리한다.
woodcutter.phase = 'rest';
woodcutter.path = [];
woodcutter.carrying = {};
woodcutter.x = x;
woodcutter.y = y;
woodcutter.px = x;
woodcutter.py = y;
outside.terrain = 'forest';
outside.treeStage = 'mature';
outside.buildingId = null;
assert.equal(gatheringZones.isTileInLumberCampWorkArea(camp, outside), false);
assert.equal(
  simulation.tryPlaceBuilding(state, 'hut', outside.x, outside.y, undefined, undefined, { approveClearing: true }),
  null,
  'a building site may be staked on the forest outside the assigned camp area',
);
const construction = state.buildings.at(-1);
assert.equal(construction.type, 'hut');
let constructionSiteCleared = false;
for (let tick = 0; tick < CONFIG.agents.subticksPerDay * 8 && !constructionSiteCleared; tick++) {
  state.pendingChoice = null;
  simulation.advanceTick(state);
  constructionSiteCleared = outside.terrain !== 'forest';
}
assert.equal(constructionSiteCleared, true,
  'assigned woodcutter clears a construction site outside the lumber camp work area first');

console.log('lumber camp worksite tests passed');
