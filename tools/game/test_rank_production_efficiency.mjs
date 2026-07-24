import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-rank-production-'));
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

const compiledDir = compileGameModules();
const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);
const simulation = await load('simulation');
const agents = await load('agents');
const workerSlots = await load('workerSlots');
const efficiency = await load('productionEfficiency');
const { CONFIG } = await load('config');
const { CROP_DEFS } = await load('crops');

assert.deepEqual(CONFIG.production.rankLaborEfficiency, {
  settlement: 1,
  bo: 1.1,
  jin: 1.15,
  bu: 1.18,
});
assert.equal(efficiency.rankProductionEfficiency(undefined), 1);

// 각 승격에서 새 생산·서비스 직업을 한 명씩 운용해도 종전 총 노동력의 95% 이상을 유지한다.
const laborScenarios = [
  { rank: 'bo', population: 40, specialistJobs: ['miller', 'miner', 'fisher', 'potter', 'weaver'] },
  {
    rank: 'jin', population: 60,
    specialistJobs: [
      'miller', 'miner', 'fisher', 'potter', 'weaver',
      'charcoalBurner', 'herder', 'physician', 'teacher', 'undertaker',
    ],
  },
  {
    rank: 'bu', population: 100,
    specialistJobs: [
      'miller', 'miner', 'fisher', 'potter', 'weaver',
      'charcoalBurner', 'herder', 'physician', 'teacher', 'undertaker',
      'powderMaker', 'clerk',
    ],
  },
];
for (const scenario of laborScenarios) {
  const remainingLabor = scenario.population - scenario.specialistJobs.length;
  const effectiveLabor = remainingLabor * efficiency.rankProductionEfficiency(scenario.rank);
  assert.ok(effectiveLabor >= scenario.population * 0.95,
    `${scenario.rank} specialist staffing leaves at least 95% effective baseline labor`);
}

function openInteriorTile(state) {
  for (let y = 2; y < state.map.length - 2; y++) {
    for (let x = 2; x < state.map[y].length - 2; x++) {
      const tile = state.map[y][x];
      if (tile.buildingId == null) return tile;
    }
  }
  throw new Error('no open tile found');
}

function placeBuilt(state, type, tile, extra = {}) {
  const building = {
    id: state.nextBuildingId++, type, x: tile.x, y: tile.y,
    progress: 99, built: true, fieldGrowth: 0, inventory: {}, ...extra,
  };
  state.buildings.push(building);
  tile.buildingId = building.id;
  return building;
}

function prepareAutumnFarmer(seed, rank) {
  const state = simulation.newGame(seed);
  state.rank = rank;
  state.day = 25;
  state.weather = 'clear';
  state.resources.tools = 100;
  const tile = openInteriorTile(state);
  tile.terrain = 'plain';
  const field = placeBuilt(state, 'field', tile, { cropId: 'millet', fieldGrowth: 100 });
  const farmer = state.residents[0];
  for (const resident of state.residents) resident.alive = resident.id === farmer.id;
  Object.assign(farmer, {
    job: 'farmer', morale: 50, health: 100, sick: false, stage: null,
    skills: {}, assignedBuildingId: null,
    x: tile.x, y: tile.y, px: tile.x, py: tile.y,
    phase: 'rest', path: [], workTimer: 0, targetId: null, carrying: {},
  });
  assert.equal(workerSlots.assignResidentToBuilding(state, farmer.id, field.id), null);
  state.subTick = 1;
  agents.agentsTick(state);
  return field.inventory.grain ?? 0;
}

const settlementHarvest = prepareAutumnFarmer(2026071711, 'settlement');
const jinHarvest = prepareAutumnFarmer(2026071711, 'jin');
assert.ok(settlementHarvest > 0, 'control farmer harvests grain');
assert.ok(Math.abs(jinHarvest / settlementHarvest - CONFIG.production.rankLaborEfficiency.jin) < 0.000001,
  'the actual farmer output path receives the configured jin efficiency multiplier');
assert.ok(jinHarvest < (CONFIG.agents.work.harvestPerSubtick * CONFIG.farming.tilesPerFarmer / 100)
  * CROP_DEFS.millet.yield * CONFIG.production.resourceOutputMultiplier * 1.2,
  'the rank bonus remains a moderate adjustment rather than a production spike');

const courtWindowSource = readFileSync(new URL('../../src/components/dock/CourtWindow.tsx', import.meta.url), 'utf8');
assert.match(courtWindowSource, /생산 조직 효율/,
  'the court window must expose the current rank production bonus to the player');

console.log(JSON.stringify({
  rankEfficiency: CONFIG.production.rankLaborEfficiency,
  laborCoverage: Object.fromEntries(laborScenarios.map(scenario => [
    scenario.rank,
    Number((((scenario.population - scenario.specialistJobs.length)
      * efficiency.rankProductionEfficiency(scenario.rank) / scenario.population) * 100).toFixed(1)),
  ])),
  autumnFarmerOutput: {
    settlement: settlementHarvest,
    jin: jinHarvest,
    increasePercent: Number(((jinHarvest / settlementHarvest - 1) * 100).toFixed(1)),
  },
}, null, 2));
console.log('rank production efficiency balance tests passed');
