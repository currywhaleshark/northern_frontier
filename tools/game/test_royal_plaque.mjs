import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-royal-plaque-'));
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

const store = new Map();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
  removeItem: key => store.delete(key),
};

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);
const royalPlaque = await import(pathToFileURL(join(compiledDir, 'royalPlaque.mjs')).href);
const fermentation = await import(pathToFileURL(join(compiledDir, 'fermentation.mjs')).href);
const raidDamage = await import(pathToFileURL(join(compiledDir, 'raidDamage.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);

const expectedProductionTypes = [
  'smokehouse',
  'dryingRack',
  'onggiKiln',
  'saltworks',
  'jangdokdae',
  'woodShed',
  'watermill',
  'smithy',
  'charcoalKiln',
  'stable',
  'nitreYard',
  'tannery',
  'weavingHouse',
];

assert.deepEqual(
  [...royalPlaque.ROYAL_PLAQUE_PRODUCTION_BUILDING_TYPES],
  expectedProductionTypes,
  'the explicit classifier covers every intended transforming, fermenting, or livestock production building',
);
for (const type of Object.keys(buildings.BUILDING_DEFS)) {
  assert.equal(
    royalPlaque.isRoyalPlaqueProductionBuildingType(type),
    expectedProductionTypes.includes(type),
    `${type} has an explicit plaque eligibility decision`,
  );
}
for (const type of [
  'field', 'paddy', 'lumberCamp', 'huntLodge', 'herbHut', 'mine', 'ferry',
  'hut', 'ondol', 'tileHouse', 'center', 'clinic', 'office', 'market',
  'beacon', 'palisade', 'earthFort', 'stoneWall', 'gate', 'watchtower',
  'garrison', 'cannonEmplacement', 'bridge', 'storehouse', 'cellar', 'dock',
  'cemetery', 'school', 'shrine', 'hermitage',
]) {
  assert.equal(royalPlaque.isRoyalPlaqueProductionBuildingType(type), false, `${type} is not a production target`);
}

const agentsSource = readFileSync(new URL('../../src/game/agents.ts', import.meta.url), 'utf8');
const fermentationSource = readFileSync(new URL('../../src/game/fermentation.ts', import.meta.url), 'utf8');
const sourceCoverage = {
  smokehouse: /assignedWorkplaceOfTypes[\s\S]*\['smokehouse', 'dryingRack'\][\s\S]*plaqueProductionMultiplier\(state, workplace\.id\)/,
  dryingRack: /assignedWorkplaceOfTypes[\s\S]*\['smokehouse', 'dryingRack'\][\s\S]*plaqueProductionMultiplier\(state, workplace\.id\)/,
  onggiKiln: /assignedWorkplace\(state, r, ctx, 'onggiKiln'[\s\S]*plaqueProductionMultiplier\(state, kiln\.id\)/,
  woodShed: /assignedWorkplace\(state, r, ctx, 'woodShed'[\s\S]*plaqueProductionMultiplier\(state, shed\.id\)/,
  watermill: /assignedWorkplace\(state, r, ctx, 'watermill'[\s\S]*plaqueProductionMultiplier\(state, mill\.id\)/,
  smithy: /assignedWorkplace\(state, r, ctx, 'smithy'[\s\S]*plaqueProductionMultiplier\(state, smithy\.id\)/,
  charcoalKiln: /assignedWorkplace\(state, r, ctx, 'charcoalKiln'[\s\S]*plaqueProductionMultiplier\(state, kiln\.id\)/,
  stable: /assignedWorkplace\(state, r, ctx, 'stable'[\s\S]*plaqueProductionMultiplier\(state, stable\.id\)/,
  nitreYard: /assignedWorkplace\(state, r, ctx, 'nitreYard'[\s\S]*plaqueProductionMultiplier\(state, yard\.id\)/,
  tannery: /assignedWorkplace\(state, r, ctx, 'tannery'[\s\S]*plaqueProductionMultiplier\(state, tannery\.id\)/,
  weavingHouse: /assignedWorkplace\(state, r, ctx, 'weavingHouse'[\s\S]*plaqueProductionMultiplier\(state, weavingHouse\.id\)/,
};
for (const [type, pattern] of Object.entries(sourceCoverage)) {
  assert.match(agentsSource, pattern, `${type} final output path applies the plaque multiplier`);
}
assert.match(
  fermentationSource,
  /building\.type !== 'jangdokdae'[\s\S]*amount \* plaqueProductionMultiplier\(state, building\.id\)/,
  'jangdokdae maturation applies the plaque multiplier to the completed product',
);
assert.doesNotMatch(
  agentsSource,
  /fieldGrowth[\s\S]{0,120}plaqueProductionMultiplier|gatherJob\([\s\S]{0,300}plaqueProductionMultiplier/,
  'plaque output does not leak into field growth or gathering work',
);

function clearMap(state) {
  for (const row of state.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.hasIron = false;
      tile.buildingId = null;
    }
  }
  state.buildings = [];
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
}

function addBuilt(state, type, x, y, overrides = {}) {
  const building = {
    id: state.nextBuildingId++,
    type,
    x,
    y,
    progress: buildings.BUILDING_DEFS[type].buildDays,
    built: true,
    fieldGrowth: 0,
    ...overrides,
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function prepare(seed) {
  const state = simulation.newGame(seed);
  clearMap(state);
  state.rank = 'bu';
  state.day = 1;
  state.subTick = 9;
  state.weather = 'clear';
  state.pendingChoice = null;
  state.specialItems.royalPlaque = 1;
  if (!state.discoveredSpecialItems.includes('royalPlaque')) state.discoveredSpecialItems.push('royalPlaque');
  addBuilt(state, 'center', 2, 2);
  return state;
}

function workableResident(state, job, x, y) {
  for (const resident of state.residents) resident.alive = false;
  const resident = state.residents[0];
  Object.assign(resident, {
    alive: true,
    sick: false,
    health: 100,
    hunger: 100,
    warmth: 100,
    morale: 70,
    job,
    assignedBuildingId: null,
    x,
    y,
    px: x,
    py: y,
    phase: 'rest',
    path: [],
    workTimer: 0,
    targetId: null,
    carrying: {},
    haulTask: null,
    manualOrder: null,
    skills: {},
  });
  return resident;
}

{
  const state = prepare(2026072901);
  const smithy = addBuilt(state, 'smithy', 10, 10, { inventory: { iron: 10, wood: 10 } });
  const field = addBuilt(state, 'field', 14, 10);
  const clinic = addBuilt(state, 'clinic', 18, 10);
  assert.equal(royalPlaque.royalPlaqueInstallError(state, smithy.id), null);
  assert.match(royalPlaque.royalPlaqueInstallError(state, field.id), /생산 건물/);
  assert.match(royalPlaque.royalPlaqueInstallError(state, clinic.id), /생산 건물/);
  smithy.built = false;
  assert.match(royalPlaque.royalPlaqueInstallError(state, smithy.id), /완공/);
}

{
  const state = prepare(2026072902);
  const smithy = addBuilt(state, 'smithy', 10, 10);
  const before = JSON.stringify({
    target: state.royalPlaqueBuildingId,
    count: state.specialItems.royalPlaque,
  });
  assert.equal(royalPlaque.royalPlaqueInstallError(state, smithy.id), null, 'opening confirmation only validates');
  assert.equal(JSON.stringify({
    target: state.royalPlaqueBuildingId,
    count: state.specialItems.royalPlaque,
  }), before, 'cancel leaves state unchanged because install was never called');
  assert.equal(royalPlaque.installRoyalPlaque(state, smithy.id), null, 'confirm installs');
  assert.equal(state.royalPlaqueBuildingId, smithy.id);
  assert.equal(state.specialItems.royalPlaque, 1, 'installation keeps the plaque in inventory');
  assert.equal(royalPlaque.plaqueProductionMultiplier(state, smithy.id), 1.25);
  assert.equal(royalPlaque.plaqueProductionMultiplier(state, 999999), 1);
}

{
  const state = prepare(2026072903);
  const first = addBuilt(state, 'smithy', 10, 10);
  const second = addBuilt(state, 'tannery', 14, 10);
  assert.equal(royalPlaque.royalPlaqueInstallError(state, first.id), null, 'modal may open');
  state.royalPlaqueBuildingId = second.id;
  assert.match(royalPlaque.installRoyalPlaque(state, first.id), /이미/);
  assert.equal(state.royalPlaqueBuildingId, second.id, 'a conflicting target is not overwritten at confirm time');
  state.royalPlaqueBuildingId = null;
  state.buildings = state.buildings.filter(building => building.id !== first.id);
  assert.match(royalPlaque.installRoyalPlaque(state, first.id), /찾을 수/);
  assert.equal(state.royalPlaqueBuildingId, null, 'removed modal target cannot create a dangling binding');
  assert.equal(state.specialItems.royalPlaque, 1, 'failed confirmation does not consume the item');
}

function prepareSmithProduction(seed, withPlaque) {
  const state = prepare(seed);
  const smithy = addBuilt(state, 'smithy', 10, 10, {
    inventory: { iron: 10, wood: 10 },
    smithyProduct: 'tools',
  });
  const worker = workableResident(state, 'smith', 9, 10);
  assert.equal(workerSlots.assignResidentToBuilding(state, worker.id, smithy.id), null);
  if (withPlaque) assert.equal(royalPlaque.installRoyalPlaque(state, smithy.id), null);
  return { state, smithy };
}

{
  const ordinary = prepareSmithProduction(2026072904, false);
  const plaqued = prepareSmithProduction(2026072904, true);
  simulation.advanceTick(ordinary.state);
  simulation.advanceTick(plaqued.state);
  const ordinaryIronUsed = 10 - ordinary.smithy.inventory.iron;
  const plaqueIronUsed = 10 - plaqued.smithy.inventory.iron;
  const ordinaryWoodUsed = 10 - ordinary.smithy.inventory.wood;
  const plaqueWoodUsed = 10 - plaqued.smithy.inventory.wood;
  const ordinaryOutput = ordinary.smithy.inventory.tools ?? 0;
  const plaqueOutput = plaqued.smithy.inventory.tools ?? 0;
  assert.ok(ordinaryOutput > 0, 'representative smithy path produces');
  assert.equal(plaqueIronUsed, ordinaryIronUsed, 'plaque does not increase smithy iron input');
  assert.equal(plaqueWoodUsed, ordinaryWoodUsed, 'plaque does not increase smithy wood input');
  assert.ok(Math.abs(plaqueOutput - ordinaryOutput * 1.25) < 1e-9, 'smithy final output is exactly 25% higher');
}

{
  const ordinary = prepare(2026072905);
  const plaqued = prepare(2026072905);
  ordinary.day = plaqued.day = 38;
  const ordinaryYard = addBuilt(ordinary, 'jangdokdae', 10, 10, {
    inventory: {},
    fermentBatches: [{ kind: 'kimchi', amount: 12, readyOnDay: 38 }],
  });
  const plaqueYard = addBuilt(plaqued, 'jangdokdae', 10, 10, {
    inventory: {},
    fermentBatches: [{ kind: 'kimchi', amount: 12, readyOnDay: 38 }],
  });
  assert.equal(royalPlaque.installRoyalPlaque(plaqued, plaqueYard.id), null);
  fermentation.updateFermentation(ordinary);
  fermentation.updateFermentation(plaqued);
  assert.equal(plaqueYard.inventory.kimchi, ordinaryYard.inventory.kimchi * 1.25);
  assert.equal(plaqueYard.inventory.onggi, ordinaryYard.inventory.onggi, 'plaque does not change vessel recovery/input');
}

{
  const state = prepare(2026072906);
  const smithy = addBuilt(state, 'smithy', 10, 10);
  assert.equal(royalPlaque.installRoyalPlaque(state, smithy.id), null);
  assert.match(simulation.startBuildingDemolition(state, smithy.id), /사액 현판/);
  assert.match(simulation.startBuildingRelocation(state, smithy.id, 20, 20), /사액 현판/);
  assert.equal(smithy.built, true);
  assert.equal(smithy.workOrder, undefined);
  assert.equal(simulation.setSmithyProduct(state, smithy.id, 'spears'), null, 'internal product changes remain allowed');
  assert.equal(smithy.smithyProduct, 'spears');
}

{
  const state = prepare(2026072907);
  const stable = addBuilt(state, 'stable', 10, 10, {
    livestock: { species: 'chicken', headcount: 0, growth: 0, feedShortageDays: 0 },
  });
  assert.equal(royalPlaque.installRoyalPlaque(state, stable.id), null);
  state.unlockedLivestock.push('pig');
  assert.equal(simulation.setLivestockSpecies(state, stable.id, 'pig'), null, 'internal species changes remain allowed');
  assert.equal(stable.livestock.species, 'pig');
}

{
  const state = prepare(2026072908);
  const smithy = addBuilt(state, 'smithy', 10, 10);
  assert.equal(royalPlaque.installRoyalPlaque(state, smithy.id), null);
  raidDamage.damageBuildings(state, () => 0, 1);
  assert.equal(smithy.repairing, true);
  assert.equal(state.royalPlaqueBuildingId, smithy.id, 'raid repair retains the binding');
  assert.equal(state.specialItems.royalPlaque, 1, 'raid repair retains the item');
}

{
  const state = prepare(2026072909);
  const smithy = addBuilt(state, 'smithy', 10, 10);
  assert.equal(royalPlaque.installRoyalPlaque(state, smithy.id), null);
  assert.equal(royalPlaque.cleanupRoyalPlaqueAfterBuildingRemoval(state, smithy.id), false,
    'cleanup cannot lose the plaque while the building still exists');
  assert.equal(state.royalPlaqueBuildingId, smithy.id);
  state.buildings = state.buildings.filter(building => building.id !== smithy.id);
  assert.equal(royalPlaque.cleanupRoyalPlaqueAfterBuildingRemoval(state, smithy.id), true);
  assert.equal(state.royalPlaqueBuildingId, null);
  assert.equal(state.specialItems.royalPlaque, 0);
  assert.ok(state.discoveredSpecialItems.includes('royalPlaque'), 'external loss preserves discovery');
}

{
  store.clear();
  const state = prepare(2026072910);
  const smithy = addBuilt(state, 'smithy', 10, 10);
  assert.equal(royalPlaque.installRoyalPlaque(state, smithy.id), null);
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.equal(loaded?.royalPlaqueBuildingId, smithy.id, 'valid binding survives a save round trip');
  assert.equal(loaded?.specialItems.royalPlaque, 1);

  const dangling = JSON.parse(JSON.stringify(state));
  dangling.royalPlaqueBuildingId = 999999;
  dangling.specialItems.royalPlaque = 1;
  assert.equal(saveLoad.saveGame(dangling), true);
  const normalized = saveLoad.loadGame();
  assert.equal(normalized.royalPlaqueBuildingId, null, 'dangling load binding clears after buildings load');
  assert.equal(normalized.specialItems.royalPlaque, 0, 'dangling load binding loses the plaque');
  assert.ok(normalized.discoveredSpecialItems.includes('royalPlaque'));

  const repairing = JSON.parse(JSON.stringify(state));
  repairing.buildings.find(building => building.id === smithy.id).built = false;
  repairing.buildings.find(building => building.id === smithy.id).repairing = true;
  assert.equal(saveLoad.saveGame(repairing), true);
  const repairedLoad = saveLoad.loadGame();
  assert.equal(repairedLoad.royalPlaqueBuildingId, smithy.id, 'repairing target remains a valid binding');
  assert.equal(repairedLoad.specialItems.royalPlaque, 1);
}

const sessionSource = readFileSync(new URL('../../src/GameSession.tsx', import.meta.url), 'utf8');
const dialogSource = readFileSync(new URL('../../src/components/RoyalPlaqueConfirmDialog.tsx', import.meta.url), 'utf8');
assert.match(sessionSource, /current\.pendingChoice[\s\S]*다른 선택이나 확인을 마친 뒤 사액 현판을 설치하십시오/);
assert.match(sessionSource, /const error = installRoyalPlaque\(stateRef\.current, request\.buildingId\)/,
  'confirm revalidates and commits through the atomic domain API');
assert.match(dialogSource, /옮길 수 없고[\s\S]*이전하거나 해체할 수도 없습니다/);
assert.match(dialogSource, /onClick=\{onCancel\}>취소/);
assert.match(dialogSource, /onClick=\{onConfirm\}[\s\S]*영구 귀속/);

console.log('royal plaque tests passed');
