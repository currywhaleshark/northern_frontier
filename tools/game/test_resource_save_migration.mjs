import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_m, start, spec, end) =>
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
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const tacticalModule = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const tactical = {
  ...tacticalModule,
  advanceTacticalPhase(state) {
    const battle = state.tacticalBattle;
    if (battle?.phase === 'deployment') {
      const defaults = tacticalModule.autoDeployTacticalGroups(battle);
      for (const group of battle.defenderGroups) {
        const placement = battle.deploymentPlacements?.[group.id];
        const fallback = defaults[group.id];
        if (placement == null && fallback) tacticalModule.placeTacticalDeploymentGroup(state, group.id, fallback);
      }
    }
    return tacticalModule.advanceTacticalPhase(state);
  },
};
const expeditionEngagement = await import(pathToFileURL(join(compiledDir, 'expeditionEngagement.mjs')).href);
const catalog = await import(pathToFileURL(join(compiledDir, 'resourceCatalog.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

assert.equal(saveLoad.CURRENT_SCHEMA_VERSION, 33, 'fixed silver discoveries ship with schema version 33');
assert.equal(typeof saveLoad.migrateV7ToV8, 'function');
assert.equal(typeof saveLoad.migrateV8ToV9, 'function');
assert.equal(typeof saveLoad.migrateV9ToV10, 'function');
assert.equal(typeof saveLoad.migrateV10ToV11, 'function');
assert.equal(typeof saveLoad.migrateV11ToV12, 'function');
assert.equal(typeof saveLoad.migrateV12ToV13, 'function');
assert.equal(typeof saveLoad.migrateV13ToV14, 'function');
assert.equal(typeof saveLoad.migrateV14ToV15, 'function');
assert.equal(typeof saveLoad.migrateV28ToV29, 'function');
assert.equal(typeof saveLoad.migrateV29ToV30, 'function');
assert.equal(typeof saveLoad.migrateV15ToV16, 'function');
assert.equal(typeof saveLoad.migrateV16ToV17, 'function');
assert.equal(typeof saveLoad.migrateV17ToV18, 'function');
assert.equal(typeof saveLoad.migrateV23ToV24, 'function');
assert.equal(typeof saveLoad.migrateV24ToV25, 'function');
assert.equal(typeof saveLoad.migrateV25ToV26, 'function');
assert.equal(typeof saveLoad.migrateV26ToV27, 'function');
assert.equal(typeof saveLoad.migrateV27ToV28, 'function');

{
  const migrated = saveLoad.migrateV24ToV25({ schemaVersion: 24, tacticalBattle: { phase: 'deployment' } });
  assert.equal(migrated.schemaVersion, 25);
  assert.deepEqual(migrated.tacticalBattle, { phase: 'deployment' }, 'v25 remains additive at the root schema layer');
}

{
  const migrated = saveLoad.migrateV26ToV27({ schemaVersion: 26, tacticalBattle: { phase: 'command' } });
  assert.equal(migrated.schemaVersion, 27);
  assert.deepEqual(migrated.tacticalBattle, { phase: 'command' }, 'v27 root migration remains additive');
}

{
  const migrated = saveLoad.migrateV27ToV28({ schemaVersion: 27, tacticalBattle: { phase: 'command' } });
  assert.equal(migrated.schemaVersion, 28);
  assert.deepEqual(migrated.tacticalBattle, { phase: 'command' }, 'v28 root migration remains additive');
}

{
  const migrated = saveLoad.migrateV29ToV30({ schemaVersion: 29, tacticalBattleReport: { battleId: 7 } });
  assert.equal(migrated.schemaVersion, 30);
  assert.deepEqual(migrated.tacticalBattleReport, { battleId: 7 }, 'v30 root migration remains additive');
}

{
  const migrated = saveLoad.migrateV30ToV31({ schemaVersion: 30, rank: 'jin', specialItems: {} });
  assert.equal(migrated.schemaVersion, 31);
  assert.equal(migrated.specialItems.boDecree, 1);
  assert.equal(migrated.specialItems.jinDecree, 1);
  assert.equal(migrated.specialItems.buDecree, 0);
}

{
  const migrated = saveLoad.migrateV31ToV32({
    schemaVersion: 31,
    buildings: [{ id: 1, type: 'center', x: 10, y: 10 }, { id: 2, type: 'hut', x: 12, y: 10 }],
  });
  assert.equal(migrated.schemaVersion, 32);
  assert.deepEqual(migrated.buildings[0], { id: 1, type: 'center', x: 10, y: 10, w: 2, h: 2 });
}

{
  const migrated = saveLoad.migrateV32ToV33({
    schemaVersion: 32,
    seed: 77,
    map: [[{ terrain: 'rock', hasSilver: true, mineralRemaining: 64 }]],
    silverVein: { status: 'secret', x: 0, y: 0, discoveredDay: 12, minedTotal: 9 },
  });
  assert.equal(migrated.schemaVersion, 33);
  assert.equal(migrated.silverVein.discoveredAmount, 73,
    'active legacy veins reconstruct their original reserve from remaining plus mined');
}

{
  const migrated = saveLoad.migrateV25ToV26({ schemaVersion: 25, marker: 'kept' });
  assert.equal(migrated.schemaVersion, 26);
  assert.equal(migrated.marker, 'kept', 'v26 remains additive at the root schema layer');
}

{
  const migrated = saveLoad.migrateV8ToV9({
    schemaVersion: 8,
    day: 40,
    foreignSites: [{ type: 'banditLair', scoutedUntilDay: 60, lairDoctrine: 'wallHold' }],
    tacticalBattle: {
      enemyPlan: {
        stratagems: [
          { id: 'rearManeuver', counterLevel: 0 },
          { id: 'fireArrows', counterLevel: 1 },
          { id: 'nightApproach', counterLevel: 2 },
        ],
      },
    },
  });
  assert.equal(migrated.schemaVersion, 9);
  assert.deepEqual(migrated.tacticalBattle.enemyPlan.stratagems.map(entry => entry.counter), [
    {}, { preparation: 0.6 }, { intelligence: 1 },
  ]);
  assert.equal(migrated.foreignSites[0].lairDoctrineRevision, 0);
  assert.ok(migrated.foreignSites[0].lairDoctrineNextReviewDay > 60,
    'legacy doctrine review never predates active scouting intel');
}

{
  const migrated = saveLoad.migrateV16ToV17({ schemaVersion: 16, resources: { eggs: 3 } });
  assert.equal(migrated.schemaVersion, 17);
  assert.equal(migrated.resources.eggs, 3);
}

{
  const migrated = saveLoad.migrateV17ToV18({ schemaVersion: 17, resources: { herbs: 3 } });
  assert.equal(migrated.schemaVersion, 18);
  assert.equal(migrated.resources.herbs, 3);
}

{
  const migrated = saveLoad.migrateV18ToV19({ schemaVersion: 18, resources: { herbs: 3 } });
  assert.equal(migrated.schemaVersion, 19);
  assert.equal(migrated.resources.herbs, 3, 'v19 (silver) is purely additive');
}

{
  const state = simulation.newGame(2026071718);
  state.residents.forEach(resident => {
    resident.job = 'idle';
    resident.alive = true;
    resident.sick = false;
    resident.health = 100;
    resident.quarantinedUntil = 0;
  });
  state.residents[0].job = 'physician';
  state.residents.slice(1, 3).forEach(resident => { resident.job = 'militia'; });
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'v18 healer save', power: 20, warned: true, siege: false, mode: 'garrison',
  });
  const raw = JSON.parse(JSON.stringify(battle));
  const rawHealer = raw.defenderGroups.find(group => group.kind === 'healer');
  assert.ok(rawHealer);
  rawHealer.zoneId = 'storehouse';
  rawHealer.line = 'front';
  rawHealer.weapon = 'spear';
  rawHealer.command = 'hold';
  rawHealer.commandable = true;
  delete raw.deploymentPlacements;
  const migratedBattle = saveLoad.migrateTacticalBattle(raw, state);
  const healer = migratedBattle?.defenderGroups.find(group => group.kind === 'healer');
  assert.ok(healer, 'v18 tactical saves preserve healer defender groups');
  assert.equal(healer.role, 'healer');
  assert.equal(healer.weapon, null);
  assert.equal(healer.zoneId, 'storehouse');
  assert.equal(healer.line, 'rear');
  assert.equal(healer.command, null);
  assert.equal(healer.commandable, false);
  assert.equal(healer.lockedZoneId, undefined, 'healers remain movable between zones during deployment');
}

{
  const state = simulation.newGame(2026071911);
  const battle = tactical.createTacticalBattle(state, {
    factionName: '홀라온 야인', power: 70, warned: true, siege: false, mode: 'garrison',
  });
  const raw = JSON.parse(JSON.stringify(battle));
  delete raw.enemyPlan.doctrine;
  delete raw.enemyPlan.doctrineRevealed;
  delete raw.enemyPlan.compositionTemplateId;
  delete raw.enemyPlan.compositionRevealed;
  const legacyGroupIds = raw.raiderGroups.map(group => group.id);
  const migrated = saveLoad.migrateTacticalBattle(raw, state);
  assert.ok(migrated);
  assert.equal(migrated.enemyPlan.doctrine, 'mountedSkirmish');
  assert.equal(migrated.enemyPlan.doctrineRevealed, false);
  assert.equal(migrated.enemyPlan.compositionTemplateId, 'holaon-legacy-host');
  assert.equal(migrated.enemyPlan.compositionRevealed, false);
  assert.deepEqual(migrated.raiderGroups.map(group => group.id), legacyGroupIds,
    'legacy metadata synthesis never regenerates or rewrites an in-progress enemy formation');
}

{
  const migrated = saveLoad.migrateV15ToV16({
    schemaVersion: 15,
    resources: { grain: 20 },
    buildings: [{ type: 'stable', built: true }],
  });
  assert.equal(migrated.schemaVersion, 16);
  assert.equal(migrated.resources.eggs, 0);
  assert.deepEqual(migrated.unlockedLivestock, ['chicken']);
  assert.deepEqual(migrated.buildings[0].livestock, {
    species: 'chicken', headcount: 4, growth: 0, feedShortageDays: 0,
  });
}

{
  const migrated = saveLoad.migrateV9ToV10({
    schemaVersion: 9,
    tacticalBattle: {
      assaultKind: 'predatorHunt',
      zones: [{ id: 'huntTracks' }, { id: 'huntDrive' }, { id: 'huntDen' }],
    },
  });
  assert.equal(migrated.schemaVersion, 10);
  assert.equal(migrated.tacticalBattle, null);
  assert.equal(migrated.legacyHuntRecoveryNeeded, true);
}

{
  const migrated = saveLoad.migrateV14ToV15({
    schemaVersion: 14,
    resources: { grain: 20 },
  });
  assert.equal(migrated.schemaVersion, 15);
  assert.equal(migrated.resources.grain, 20);
  assert.equal(migrated.resources.kimchi, 0);
  assert.equal(migrated.lastKimjangYear, 0);
}

{
  const migrated = saveLoad.migrateV12ToV13({
    schemaVersion: 12,
    resources: { grain: 20 },
  });
  assert.equal(migrated.schemaVersion, 13);
  assert.equal(migrated.resources.grain, 20);
  assert.equal(migrated.resources.beans, 0);
  assert.equal(migrated.resources.onggi, 0);
}

{
  const migrated = saveLoad.migrateV13ToV14({
    schemaVersion: 13,
    resources: { grain: 20 },
    buildings: [
      {
        type: 'jangdokdae',
        fermentBatches: [
          { kind: 'jang', amount: 8, readyOnDay: 55 },
          { kind: 'invalid', amount: 4, readyOnDay: 60 },
        ],
      },
      { type: 'hut' },
    ],
  });
  assert.equal(migrated.schemaVersion, 14);
  assert.equal(migrated.resources.grain, 20);
  assert.equal(migrated.resources.jang, 0);
  assert.deepEqual(migrated.buildings[0].fermentBatches, [{ kind: 'jang', amount: 8, readyOnDay: 55 }]);
  assert.deepEqual(migrated.buildings[1].fermentBatches, []);
}

{
  const state = simulation.newGame(2026071617);
  state.resources.kimchi = 7;
  state.lastKimjangYear = 2;
  const yard = {
    id: state.nextBuildingId++, type: 'jangdokdae', x: 0, y: 0,
    progress: 5, built: true, fieldGrowth: 0, inventory: { beans: 4 },
    fermentBatches: [
      { kind: 'jang', amount: 8, readyOnDay: 55 },
      { kind: 'kimchi', amount: 6, readyOnDay: 39 },
    ],
  };
  state.buildings.push(yard);
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  const loadedYard = loaded?.buildings.find(building => building.id === yard.id);
  assert.deepEqual(loadedYard?.fermentBatches, [
    { kind: 'jang', amount: 8, readyOnDay: 55 },
    { kind: 'kimchi', amount: 6, readyOnDay: 39 },
  ]);
  assert.equal(loadedYard?.inventory?.beans, 4);
  assert.equal(loaded?.resources.kimchi, 7);
  assert.equal(loaded?.lastKimjangYear, 2);
}

{
  const migrated = saveLoad.migrateV11ToV12({
    schemaVersion: 11,
    resources: { grain: 20 },
    buildings: [{ type: 'dryingRack' }],
  });
  assert.equal(migrated.schemaVersion, 12);
  assert.equal(migrated.resources.grain, 20);
  assert.equal(migrated.resources.curedMeat, 0);
  assert.equal(migrated.resources.saltedFish, 0);
  assert.equal(migrated.resources.driedFish, 0);
  assert.equal(migrated.buildings[0].dryingProduct, 'saltedFish');
}

{
  const migrated = saveLoad.migrateV10ToV11({
    schemaVersion: 10,
    resources: { grain: 20 },
  });
  assert.equal(migrated.schemaVersion, 11);
  assert.equal(migrated.resources.grain, 20);
  assert.equal(migrated.resources.salt, 0, 'legacy saves gain an empty salt stock');
}

{
  const legacyHunt = simulation.newGame(2026071516);
  const memberIds = legacyHunt.residents.slice(0, 2).map(resident => resident.id);
  legacyHunt.residents.slice(0, 2).forEach(resident => { resident.job = 'hunter'; });
  legacyHunt.incidents.predatorThreats.tiger = {
    kind: 'tiger', untilDay: legacyHunt.day + 10, size: 1, strength: 60, tigerTier: 'tiger',
  };
  legacyHunt.expedition = {
    kind: 'predatorHunt', predatorKind: 'tiger', targetX: 10, targetY: 10,
    musterX: 9, musterY: 10, phase: 'engage', memberIds,
    x: 10, y: 10, px: 10, py: 10, path: [], trail: [], speed: 1, ticks: 0,
  };
  legacyHunt.pendingChoice = { kind: 'expeditionEngagement', title: 'old', body: '', options: [], data: {} };
  legacyHunt.tacticalBattle = {
    assaultKind: 'predatorHunt', encounterKind: 'predatorHunt',
    zones: [{ id: 'huntTracks' }, { id: 'huntDrive' }, { id: 'huntDen' }],
  };
  store.set('buksae-save-v3', JSON.stringify({ ...legacyHunt, schemaVersion: 9 }));
  const loaded = saveLoad.loadGame();
  assert.ok(loaded);
  assert.equal(loaded.tacticalBattle, null);
  assert.equal(loaded.expedition?.phase, 'engage', 'legacy hunt recovery keeps the expedition at the encounter');
  assert.equal(loaded.pendingChoice, null);
  expeditionEngagement.maybeOpenExpeditionEngagementChoice(loaded);
  assert.equal(loaded.pendingChoice?.kind, 'expedition', 'the direct/automatic engagement choice reopens');
  assert.ok(loaded.pendingChoice?.options.some(option => option.id === 'direct'));
}

{
  const state = simulation.newGame(2026071511);
  const lair = state.foreignSites.find(site => site.type === 'banditLair');
  assert.ok(lair);
  lair.lairDoctrine = 'leaderEscape';
  lair.lairDoctrineRevealed = false;
  lair.lairDoctrineRevision = 3;
  lair.lairDoctrineChosenDay = 77;
  lair.lairDoctrineNextReviewDay = 101;
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  const loadedLair = loaded?.foreignSites.find(site => site.id === lair.id);
  assert.ok(loadedLair);
  assert.equal(loadedLair.lairDoctrine, 'leaderEscape');
  assert.equal(loadedLair.lairDoctrineRevealed, false);
  assert.equal(loadedLair.lairDoctrineRevision, 3);
  assert.equal(loadedLair.lairDoctrineChosenDay, 77);
  assert.equal(loadedLair.lairDoctrineNextReviewDay, 101,
    'doctrine revision scheduling survives a save/load round trip');
}

{
  const legacy = simulation.newGame(2026071010);
  delete legacy.schemaVersion;
  legacy.resources = {
    food: 11, clothes: 2, game: 3, grain: 5, meat: 1, hide: 1,
    wood: 20, stone: 10, tools: 4, reputation: 50, defense: 0,
  };
  legacy.residents[0].carrying = { food: 2, clothes: 1, game: 1 };
  legacy.buildings[0].inventory = { food: 3, game: 2 };
  legacy.processingReserves = { wood: 7, grain: 9, game: 2, hide: 1, iron: 0 };
  legacy.courtTribute = { year: 1, items: { clothes: 3 }, dueDay: 37, resolved: false, paid: false };
  legacy.pendingChoice = {
    kind: 'trade', title: 'legacy trade', body: '', options: [],
    data: { give: 'food', giveAmt: 2, get: 'game', getAmt: 1 },
  };
  delete legacy.lastImmigrationDay;
  delete legacy.tacticalBattle;
  delete legacy.tacticalBattleReport;
  const legacyStone = legacy.map.flat().find(tile => tile.terrain === 'rock' && !tile.hasIron);
  const legacyIron = legacy.map.flat().find(tile => tile.terrain === 'rock' && tile.hasIron);
  assert.ok(legacyStone && legacyIron);
  delete legacyStone.mineralRemaining;
  delete legacyIron.mineralRemaining;

  assert.equal(saveLoad.saveGame(legacy), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded);
  assert.equal(loaded.schemaVersion, saveLoad.CURRENT_SCHEMA_VERSION);

  assert.equal(loaded.resources.grain, 16);
  assert.equal(loaded.resources.meat, 13);
  assert.equal(loaded.resources.hide, 4);
  assert.equal(loaded.resources.hideClothes, 2);
  assert.equal(loaded.resources.salt, 0);
  assert.equal(loaded.residents[0].carrying.grain, 2);
  assert.equal(loaded.residents[0].carrying.meat, 4);
  assert.equal(loaded.residents[0].carrying.hide, 1);
  assert.equal(loaded.buildings[0].inventory.grain, 3);
  assert.equal(loaded.buildings[0].inventory.meat, 8);
  assert.equal(loaded.buildings[0].inventory.hide, 2);
  assert.deepEqual(loaded.courtTribute.items, { hideClothes: 3 });
  assert.equal(loaded.processingReserves.wood, 7);
  assert.equal(loaded.processingReserves.rice, 0);
  assert.equal(loaded.pendingChoice, null);
  assert.equal(loaded.lastImmigrationDay, -999);
  assert.equal(loaded.tacticalBattle, null);
  assert.equal(loaded.tacticalBattleReport, null);
  for (const id of catalog.RESOURCE_IDS) assert.equal(typeof loaded.resources[id], 'number');
  assert.equal(Object.hasOwn(loaded.resources, 'food'), false);
  assert.equal(Object.hasOwn(loaded.resources, 'clothes'), false);
  assert.equal(Object.hasOwn(loaded.resources, 'game'), false);
  assert.equal(loaded.map[legacyStone.y][legacyStone.x].mineralRemaining, CONFIG.minerals.legacyStone);
  assert.equal(loaded.map[legacyIron.y][legacyIron.x].mineralRemaining, CONFIG.minerals.legacyIron);
}

{
  const source = { schemaVersion: 3, residents: [] };
  const migrated = saveLoad.migrateToCurrent(source);
  assert.equal(source.schemaVersion, 3, 'schema migration must not mutate its input');
  assert.equal(migrated.schemaVersion, saveLoad.CURRENT_SCHEMA_VERSION);
}

{
  const future = { schemaVersion: saveLoad.CURRENT_SCHEMA_VERSION + 1 };
  assert.throws(() => saveLoad.migrateToCurrent(future), /future|미래|지원하지/i);
  store.set('buksae-save-v3', JSON.stringify(future));
  assert.equal(saveLoad.loadGame(), null, 'a future schema save is rejected instead of being downgraded');
}

function prepareFormationTestCombatants(state) {
  state.resources.muskets = 1;
  state.resources.hornBows = 1;
  state.resources.spears = 1;
  state.resources.gunpowder = 10;
  state.residents.slice(0, 3).forEach(resident => {
    resident.job = 'militia';
    resident.sick = false;
    resident.health = 100;
    resident.quarantinedUntil = 0;
  });
}

{
  const v7 = simulation.newGame(2026071457);
  prepareFormationTestCombatants(v7);
  const battle = tactical.createTacticalBattle(v7, {
    factionName: 'v7 formation preservation', power: 40, warned: true, siege: false, mode: 'garrison',
  });
  const muskets = battle.defenderGroups.find(group => group.kind === 'militia-musket');
  assert.ok(muskets);
  muskets.line = 'rear';
  store.set('buksae-save-v3', JSON.stringify({ ...v7, schemaVersion: 7 }));
  const loaded = saveLoad.loadGame();
  assert.equal(loaded?.schemaVersion, saveLoad.CURRENT_SCHEMA_VERSION);
  assert.equal(
    loaded?.tacticalBattle?.defenderGroups.find(group => group.id === muskets.id)?.line,
    'rear',
    'valid v7 front/rear placements remain unchanged',
  );
}

{
  const v8 = simulation.newGame(2026071458);
  prepareFormationTestCombatants(v8);
  const battle = tactical.createTacticalBattle(v8, {
    factionName: 'v8 formation load', power: 40, warned: true, siege: false, mode: 'garrison',
  });
  const muskets = battle.defenderGroups.find(group => group.kind === 'militia-musket');
  assert.ok(muskets);
  assert.equal(muskets.line, 'middle');
  assert.equal(saveLoad.saveGame(v8), true);
  const loaded = saveLoad.loadGame();
  assert.equal(loaded?.schemaVersion, saveLoad.CURRENT_SCHEMA_VERSION);
  assert.equal(loaded?.tacticalBattle?.defenderGroups.find(group => group.id === muskets.id)?.line, 'middle');
}

{
  const redeploySave = simulation.newGame(2026071461);
  prepareFormationTestCombatants(redeploySave);
  const battle = tactical.createTacticalBattle(redeploySave, {
    factionName: 'redeploy save continuation', power: 40, warned: true, siege: false, mode: 'garrison',
  });
  assert.equal(tactical.advanceTacticalPhase(redeploySave), null);
  assert.equal(tactical.advanceTacticalPhase(redeploySave), null);
  const muskets = battle.defenderGroups.find(group => group.kind === 'militia-musket');
  assert.ok(muskets);
  assert.equal(tactical.setDefenderFormationLine(redeploySave, muskets.id, 'front'), null);
  assert.equal(muskets.line, 'middle');
  assert.equal(muskets.pendingLine, 'front');
  assert.equal(muskets.command, 'redeploy');
  assert.equal(saveLoad.saveGame(redeploySave), true);
  const loaded = saveLoad.loadGame();
  const loadedMuskets = loaded?.tacticalBattle?.defenderGroups.find(group => group.id === muskets.id);
  assert.equal(loadedMuskets?.line, 'middle');
  assert.equal(loadedMuskets?.pendingLine, 'front');
  assert.equal(loadedMuskets?.command, 'redeploy');
  assert.equal(tactical.resolveTacticalRound(loaded), null);
  assert.equal(loadedMuskets.line, 'middle');
  assert.equal(tactical.completeTacticalSimulation(loaded), null);
  assert.equal(loaded.tacticalBattle.pendingReport.ended, false);
  assert.equal(tactical.acknowledgeTacticalReport(loaded), null);
  assert.equal(loadedMuskets.line, 'front', 'saved redeployment continues after load and report acknowledgement');
  assert.equal(loadedMuskets.pendingLine, undefined);
}

{
  const invalidPendingLine = simulation.newGame(2026071462);
  prepareFormationTestCombatants(invalidPendingLine);
  const battle = tactical.createTacticalBattle(invalidPendingLine, {
    factionName: 'invalid pending line recovery', power: 40, warned: true, siege: false, mode: 'garrison',
  });
  const spear = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  assert.ok(spear);
  spear.command = 'redeploy';
  spear.commandSource = 'player';
  spear.pendingLine = 'rear';
  assert.equal(saveLoad.saveGame(invalidPendingLine), true);
  const loaded = saveLoad.loadGame();
  const loadedSpear = loaded?.tacticalBattle?.defenderGroups.find(group => group.id === spear.id);
  assert.equal(loadedSpear?.line, 'front');
  assert.equal(loadedSpear?.pendingLine, undefined, 'non-adjacent pendingLine is cleared field-by-field');
  assert.equal(loadedSpear?.command, null, 'redeploy without a valid target is cleared safely');
}

{
  const rearReserveSave = simulation.newGame(2026071465);
  prepareFormationTestCombatants(rearReserveSave);
  const battle = tactical.createTacticalBattle(rearReserveSave, {
    factionName: 'rear reserve save', power: 40, warned: true, siege: false, mode: 'garrison',
  });
  assert.equal(tactical.advanceTacticalPhase(rearReserveSave), null);
  assert.equal(tactical.advanceTacticalPhase(rearReserveSave), null);
  const spear = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  const flanker = battle.raiderGroups.find(group => group.kind === 'flankers');
  assert.ok(spear && flanker);
  spear.line = 'middle';
  spear.zoneId = 'wall';
  flanker.zoneId = 'wall';
  flanker.rearAssault = true;
  flanker.engagementsInZone = 1;
  flanker.aiState = 'committingReserve';
  flanker.aiStateChangedRound = 3;
  flanker.intentLockedUntilRound = 5;
  assert.equal(tactical.setTacticalCommand(rearReserveSave, spear.id, 'reinforceRear'), null);
  assert.equal(saveLoad.saveGame(rearReserveSave), true);
  const loaded = saveLoad.loadGame();
  const loadedSpear = loaded?.tacticalBattle?.defenderGroups.find(group => group.id === spear.id);
  assert.equal(loadedSpear?.command, 'reinforceRear');
  assert.equal(loadedSpear?.commandSource, 'player');
  assert.equal(loadedSpear?.facing, 'towardRear');
  assert.equal(loadedSpear?.pendingFacing, 'towardRear',
    'the immediate direction and its current-round penalty marker survive a save round-trip');
  const loadedFlanker = loaded?.tacticalBattle?.raiderGroups.find(group => group.id === flanker.id);
  assert.equal(loadedFlanker?.aiState, 'committingReserve');
  assert.equal(loadedFlanker?.aiStateChangedRound, 3);
  assert.equal(loadedFlanker?.intentLockedUntilRound, 5,
    'doctrine intent locks survive a tactical save round-trip');
}

{
  const legacyFacingState = simulation.newGame(2026072052);
  prepareFormationTestCombatants(legacyFacingState);
  const battle = tactical.createTacticalBattle(legacyFacingState, {
    factionName: 'legacy facing synthesis', power: 40, warned: true, siege: false, mode: 'garrison',
  });
  const spear = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  const bow = battle.defenderGroups.find(group => group.kind === 'militia-bow');
  const civilians = battle.defenderGroups.find(group => group.kind === 'civilian');
  const flanker = battle.raiderGroups.find(group => group.kind === 'flankers');
  assert.ok(spear && bow && civilians && flanker);
  Object.assign(spear, { zoneId: 'wall', line: 'middle', command: 'reinforceRear' });
  Object.assign(bow, { zoneId: 'wall', line: 'rear', command: 'volley' });
  Object.assign(flanker, {
    zoneId: 'wall', rearAssault: true, engagementsInZone: 1, intent: 'flank', power: 40,
  });
  const legacyBattle = JSON.parse(JSON.stringify(battle));
  legacyBattle.defenderGroups.forEach(group => {
    delete group.facing;
    delete group.pendingFacing;
  });
  const migrated = saveLoad.migrateTacticalBattle(legacyBattle, legacyFacingState);
  const migratedSpear = migrated?.defenderGroups.find(group => group.id === spear.id);
  const migratedBow = migrated?.defenderGroups.find(group => group.id === bow.id);
  const migratedCivilians = migrated?.defenderGroups.find(group => group.id === civilians.id);
  assert.equal(migratedSpear?.facing, 'towardRear',
    'an engaged legacy reinforceRear reserve is synthesized as rear-facing');
  assert.equal(migratedBow?.facing, 'towardRear',
    'an engaged legacy rear-line group preserves its former rear assignment');
  assert.equal(migratedCivilians?.facing, 'towardEnemy', 'legacy civilians keep their fixed enemy-facing default');
  assert.equal(migratedSpear?.pendingFacing, undefined, 'legacy saves do not invent a turn penalty');
}

{
  const routeState = simulation.newGame(2026072202);
  prepareFormationTestCombatants(routeState);
  const battle = tactical.createTacticalBattle(routeState, {
    factionName: '우회로 저장 복원', power: 70, warned: true, siege: false, mode: 'garrison',
    forcedFlankRoute: 'left',
  });
  assert.equal(tactical.toggleTacticalFlankRoutePreparation(routeState, 'right'), null);
  const transit = battle.raiderGroups.find(group => group.routeTransit)?.routeTransit;
  assert.ok(transit);
  transit.step = 1;
  transit.elapsedRounds = 1;
  assert.equal(saveLoad.saveGame(routeState), true);
  const loaded = saveLoad.loadGame();
  assert.deepEqual(loaded?.tacticalBattle?.flankRoutes?.map(route => ({
    side: route.side,
    openedByDefender: route.openedByDefender,
    openedByRaider: route.openedByRaider,
    intel: route.defenderIntel,
  })), [
    { side: 'left', openedByDefender: false, openedByRaider: true, intel: 'unknown' },
    { side: 'right', openedByDefender: true, openedByRaider: false, intel: 'revealed' },
  ]);
  const loadedTransit = loaded?.tacticalBattle?.raiderGroups.find(group => group.routeTransit)?.routeTransit;
  assert.equal(loadedTransit?.step, 1);
  assert.equal(loadedTransit?.elapsedRounds, 1);
  assert.equal(loadedTransit?.visibleToDefender, false,
    'hidden route transit keeps its real step in the save without exposing it to the defender');
}

{
  const rearPenaltySave = simulation.newGame(2026071591);
  prepareFormationTestCombatants(rearPenaltySave);
  const battle = tactical.createTacticalBattle(rearPenaltySave, {
    factionName: 'rear penalty save', power: 60, warned: true, siege: false, mode: 'garrison',
  });
  assert.equal(tactical.advanceTacticalPhase(rearPenaltySave), null);
  assert.equal(tactical.advanceTacticalPhase(rearPenaltySave), null);
  const spear = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  const flanker = battle.raiderGroups.find(group => group.kind === 'flankers');
  assert.ok(spear && flanker);
  battle.enemyPlan = {
    objective: 'breakthrough', objectiveRevealed: true, stratagemPoints: 2,
    stratagems: [{
      id: 'rearManeuver', revealed: true, counterLevel: 1,
      counter: { preparation: 0.6, formation: 0.95 },
    }],
  };
  battle.defenderGroups.forEach(group => {
    group.zoneId = group === spear ? 'wall' : 'center';
    group.command = 'hold';
  });
  spear.line = 'rear';
  battle.raiderGroups.forEach(group => {
    if (group !== flanker) group.intent = 'withdraw';
  });
  Object.assign(flanker, {
    zoneId: 'wall', targetZoneId: 'wall', flankPlan: 'rearAssault', rearAssault: true,
    revealed: false, engagementsInZone: 0, intent: 'flank', power: 120, count: 20, killed: 0,
    morale: 100, combatMultiplier: 0.8,
  });
  const originalCombatMultiplier = flanker.combatMultiplier;
  assert.equal(tactical.resolveTacticalRound(rearPenaltySave), null);
  assert.equal(flanker.combatMultiplier, originalCombatMultiplier,
    'resolving a rear engagement applies its counter penalty only to an effective attacker copy');
  assert.equal(saveLoad.saveGame(rearPenaltySave), true);
  const loaded = saveLoad.loadGame();
  const loadedFlanker = loaded?.tacticalBattle?.raiderGroups.find(group => group.id === flanker.id);
  assert.equal(loadedFlanker?.combatMultiplier, originalCombatMultiplier,
    'saving and loading after a rear engagement never persists or compounds its temporary penalty');
}

{
  const focusTargetSave = simulation.newGame(2026071488);
  prepareFormationTestCombatants(focusTargetSave);
  const battle = tactical.createTacticalBattle(focusTargetSave, {
    factionName: 'focus target save', power: 40, warned: true, siege: false, mode: 'garrison',
  });
  assert.equal(tactical.advanceTacticalPhase(focusTargetSave), null);
  assert.equal(tactical.advanceTacticalPhase(focusTargetSave), null);
  const zone = battle.zones.find(candidate => candidate.id === 'wall');
  const muskets = battle.defenderGroups.find(group => group.kind === 'militia-musket');
  const target = battle.raiderGroups[0];
  assert.ok(zone && target && muskets);
  Object.assign(target, { zoneId: zone.id, revealed: true, intent: 'advance', power: 50 });
  muskets.zoneId = zone.id;
  assert.equal(tactical.setTacticalGroupTarget(focusTargetSave, muskets.id, target.id), null);
  assert.equal(saveLoad.saveGame(focusTargetSave), true);
  const loaded = saveLoad.loadGame();
  const loadedMuskets = loaded?.tacticalBattle?.defenderGroups.find(group => group.id === muskets.id);
  assert.equal(loadedMuskets?.targetGroupId, target.id);
  assert.equal(loadedMuskets?.targetSource, 'player');
  assert.equal(loaded?.tacticalBattle?.raiderGroups.find(group => group.id === target.id)?.line, 'front');

  delete muskets.targetGroupId;
  delete muskets.targetSource;
  zone.focusTargetGroupId = target.id;
  zone.focusTargetSource = 'player';
  store.set('buksae-save-v3', JSON.stringify({ ...focusTargetSave, schemaVersion: 8 }));
  const legacyLoaded = saveLoad.loadGame();
  const legacyMuskets = legacyLoaded?.tacticalBattle?.defenderGroups.find(group => group.id === muskets.id);
  assert.equal(legacyMuskets?.targetGroupId, target.id,
    'a reachable v8 zone focus migrates to each capable group target');
  assert.equal(legacyMuskets?.targetSource, 'player');
  assert.ok(legacyLoaded?.tacticalBattle?.zones.every(candidate => candidate.focusTargetGroupId == null),
    'legacy zone focus is cleared after migration and never remains runtime truth');
}

{
  const invalidLines = simulation.newGame(2026071459);
  prepareFormationTestCombatants(invalidLines);
  const battle = tactical.createTacticalBattle(invalidLines, {
    factionName: 'invalid formation recovery', power: 40, warned: true, siege: false, mode: 'garrison',
  });
  for (const group of battle.defenderGroups) group.line = 'sideways';
  assert.equal(saveLoad.saveGame(invalidLines), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded?.tacticalBattle, 'invalid lines repair only the affected fields');
  assert.equal(loaded.tacticalBattle.defenderGroups.find(group => group.kind === 'militia-musket')?.line, 'middle');
  assert.ok(loaded.tacticalBattle.defenderGroups
    .filter(group => ['militia-spear', 'militia-unarmed', 'watchman'].includes(group.kind))
    .every(group => group.line === 'front'));
  assert.ok(loaded.tacticalBattle.defenderGroups
    .filter(group => ['militia-bow', 'hunter', 'civilian'].includes(group.kind))
    .every(group => group.line === 'rear'));
}

function simulatingState(seed) {
  const state = simulation.newGame(seed);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'pending report validation', power: 30, warned: true, siege: false, mode: 'garrison',
  });
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.phase, 'simulating');
  assert.ok(battle.pendingReport);
  return { state, battle };
}

{
  const { state, battle } = simulatingState(2026071450);
  battle.pendingReport = null;
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded, 'missing pendingReport only cancels the tactical battle');
  assert.equal(loaded.tacticalBattle, null);
  assert.ok(loaded.log.some(entry => entry.text.includes('전술전 데이터가 손상')));
}

for (const [field, seed] of [['events', 2026071451], ['lines', 2026071452]]) {
  const { state, battle } = simulatingState(seed);
  delete battle.pendingReport[field];
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded, `missing pendingReport.${field} only cancels the tactical battle`);
  assert.equal(loaded.tacticalBattle, null);
}

{
  const { state, battle } = simulatingState(2026071453);
  battle.pendingReport.events[0].zoneId = 'missing-zone';
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded, 'an event referencing an unknown zone only cancels the tactical battle');
  assert.equal(loaded.tacticalBattle, null);
}

{
  const state = simulation.newGame(2026071454);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'prep action validation', power: 30, warned: true, siege: false, mode: 'garrison',
  });
  const valid = battle.prepActions.find(action => action.id === 'preliminaryBombardment');
  assert.ok(valid);
  battle.prepActions = [
    { ...valid },
    { id: 'not-an-action', label: 'bad id', cost: 1, selected: false, applied: false },
    { id: 'repairWall', label: 'bad cost', cost: -1, selected: false, applied: false },
    { id: 'hideSupplies', label: 'bad selected', cost: 1, selected: 'yes', applied: false },
    { id: 'musterMilitia', label: 'bad applied', cost: 1, selected: false, applied: 'yes' },
  ];
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.deepEqual(loaded?.tacticalBattle?.prepActions.map(action => action.id),
    ['preliminaryBombardment', 'openFlankRoute']);
}

{
  const legacy = simulation.newGame(2026071331);
  const battle = tactical.createTacticalBattle(legacy, {
    factionName: '변경 마적', power: 70, warned: true, siege: false, mode: 'garrison',
  });
  delete battle.enemyPlan;
  for (const group of battle.defenderGroups) delete group.line;
  for (const group of battle.raiderGroups) {
    delete group.engagementsInZone;
    delete group.flankPlan;
    delete group.flankPlanRevealed;
    delete group.rearAssault;
  }
  assert.equal(saveLoad.saveGame(legacy), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded?.tacticalBattle);
  assert.ok(loaded.tacticalBattle.initialFriendlyPower > 0);
  assert.ok(loaded.tacticalBattle.initialEnemyPower > 0);
  assert.ok(loaded.tacticalBattle.defenderGroups
    .every(group => group.line === 'front' || group.line === 'middle' || group.line === 'rear'));
  assert.ok(loaded.tacticalBattle.defenderGroups
    .filter(group => group.kind === 'militia-musket')
    .every(group => group.line === 'middle'));
  assert.ok(loaded.tacticalBattle.defenderGroups
    .filter(group => ['militia-spear', 'militia-unarmed', 'watchman'].includes(group.kind))
    .every(group => group.line === 'front'));
  assert.ok(loaded.tacticalBattle.raiderGroups.every(group => group.engagementsInZone === 0));
  const flankers = loaded.tacticalBattle.raiderGroups.find(group => group.kind === 'flankers');
  assert.ok(flankers);
  assert.equal(flankers.flankPlan, 'breakthrough');
  assert.equal(flankers.flankPlanRevealed, false);
  assert.equal(flankers.rearAssault, false);
}

{
  const legacyPlan = simulation.newGame(2026071455);
  const battle = tactical.createTacticalBattle(legacyPlan, {
    factionName: 'legacy rear plan', power: 70, warned: true, siege: false, mode: 'garrison',
  });
  delete battle.enemyPlan;
  const flankers = battle.raiderGroups.find(group => group.kind === 'flankers');
  assert.ok(flankers);
  flankers.flankPlan = 'rearAssault';
  flankers.flankPlanRevealed = true;
  assert.equal(saveLoad.saveGame(legacyPlan), true);
  const loaded = saveLoad.loadGame();
  assert.deepEqual(loaded?.tacticalBattle?.enemyPlan, {
    objective: 'breakthrough',
    objectiveRevealed: true,
    flankRouteSide: 'left',
    stratagemPoints: 0,
    stratagems: [{ id: 'rearManeuver', revealed: true, counterLevel: 0 }],
  }, 'legacy flank fields synthesize the equivalent enemy plan');
}

{
  const malformedPlan = simulation.newGame(2026071456);
  const battle = tactical.createTacticalBattle(malformedPlan, {
    factionName: 'malformed plan', power: 70, warned: false, siege: false, mode: 'garrison',
  });
  battle.enemyPlan = {
    objective: 'invalid', objectiveRevealed: 'yes', stratagemPoints: 'many',
    stratagems: [
      { id: 'rearManeuver', revealed: 'yes', counterLevel: 7 },
      { id: 'unknown', revealed: true, counterLevel: 2 },
    ],
  };
  assert.equal(saveLoad.saveGame(malformedPlan), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded?.tacticalBattle, 'a malformed enemy plan never discards the tactical battle');
  assert.deepEqual(loaded.tacticalBattle.enemyPlan, {
    objective: 'breakthrough',
    objectiveRevealed: false,
    flankRouteSide: 'left',
    stratagemPoints: 0,
    stratagems: [{ id: 'rearManeuver', revealed: false, counterLevel: 0 }],
  });
}

{
  const partial = simulation.newGame(2026071441);
  const battle = tactical.createTacticalBattle(partial, {
    factionName: 'migration test', power: 40, warned: true, siege: false, mode: 'garrison',
  });
  delete battle.prepActions;
  delete battle.preparationEvents;
  delete battle.reports;
  assert.equal(saveLoad.saveGame(partial), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded?.tacticalBattle, 'missing optional tactical arrays are reconstructed');
  assert.ok(Array.isArray(loaded.tacticalBattle.prepActions));
  assert.ok(Array.isArray(loaded.tacticalBattle.preparationEvents));
  assert.ok(Array.isArray(loaded.tacticalBattle.reports));
}

{
  const corrupted = simulation.newGame(2026071442);
  const members = corrupted.residents.slice(0, 2);
  members.forEach(resident => { resident.job = 'militia'; resident.sick = false; resident.health = 100; });
  corrupted.expedition = {
    kind: 'lairAssault', targetX: 0, targetY: 0, musterX: members[0].x, musterY: members[0].y,
    phase: 'engage', memberIds: members.map(member => member.id), x: 0, y: 0, px: 0, py: 0,
    path: [], trail: [], speed: 1, ticks: 0,
  };
  corrupted.tacticalBattle = { phase: 'command', zones: 'broken', defenderGroups: [], raiderGroups: [] };
  corrupted.tacticalBattleReport = { broken: true };
  assert.equal(saveLoad.saveGame(corrupted), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded, 'a broken tactical battle must not discard the whole save');
  assert.equal(loaded.tacticalBattle, null);
  assert.equal(loaded.tacticalBattleReport, null);
  assert.ok(loaded.expedition == null || loaded.expedition.phase === 'return');
  assert.ok(loaded.log.some(entry => entry.text.includes('전술전 데이터가 손상')));
}

{
  const stratagemSave = simulation.newGame(2026071503);
  const battle = tactical.createTacticalBattle(stratagemSave, {
    factionName: '변경 마적', power: 90, warned: true, siege: true, mode: 'garrison',
  });
  battle.raiderGroups[0].estimatedPower = 123;
  battle.raiderGroups[1].estimatedPower = 'invalid';
  assert.equal(saveLoad.saveGame(stratagemSave), true);
  const loaded = saveLoad.loadGame();
  assert.ok(loaded?.tacticalBattle);
  assert.equal(loaded.tacticalBattle.raiderGroups[0].estimatedPower, 123);
  assert.equal(loaded.tacticalBattle.raiderGroups[1].estimatedPower, undefined,
    'invalid estimated power falls back to the live power display');
  assert.ok(loaded.tacticalBattle.prepActions.some(action => action.id === 'firePrevention'));
  assert.ok(loaded.tacticalBattle.prepActions.some(action => action.id === 'torchWatch'));
}

{
  const legacyReport = simulation.newGame(2026071443);
  legacyReport.tacticalBattleReport = {
    battleId: 77,
    outcome: 'partialLoss',
    factionName: '변경 마적',
    outcomeLabel: '마을을 지켰으나 일부 피해를 입었습니다',
  };
  assert.equal(saveLoad.saveGame(legacyReport), true);
  const loaded = saveLoad.loadGame();
  assert.equal(loaded?.tacticalBattleReport?.result, 'victory');
  assert.ok(['greatVictory', 'victory', 'narrowVictory'].includes(loaded?.tacticalBattleReport?.grade));
  assert.ok(Number.isFinite(loaded?.tacticalBattleReport?.gradeScore));
  assert.equal(loaded?.tacticalBattleReport?.closingSummary, '습격대가 약탈을 포기하고 물러납니다.');
  assert.deepEqual(loaded?.tacticalBattleReport?.recoveredLoot, {});
}

{
  const state = simulation.newGame(2026071444);
  state.tacticalBattleReport = {
    battleId: 78,
    outcome: 'defenseSuccess',
    factionName: '변경 마적',
    tactics: {
      objectiveId: 'breakthrough', objectiveLabel: '방어선 돌파', objectiveAchieved: false,
      doctrineId: 'mountedSkirmish', doctrineLabel: '기마 견제',
      compositionTemplateId: 'bandit-hit-and-run', compositionLabel: '치고 빠지는 약탈대',
      flankRoutes: [{
        routeId: 'flank-left', side: 'left', label: '숲 능선길', finalControl: 'defender',
        outcome: 'defenderHeld', engagements: 2, defenderHolds: 1, raiderBreakthroughs: 0,
        contestedEngagements: 1, defenderArrivals: 0, raiderArrivals: 0,
        summary: '숲 능선길의 차단대가 적 우회 시도를 저지했습니다.',
      }],
    },
  };
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.equal(loaded?.tacticalBattleReport?.tactics?.objectiveId, 'breakthrough');
  assert.equal(loaded?.tacticalBattleReport?.tactics?.objectiveAchieved, false);
  assert.equal(loaded?.tacticalBattleReport?.tactics?.doctrineId, 'mountedSkirmish');
  assert.equal(loaded?.tacticalBattleReport?.tactics?.compositionTemplateId, 'bandit-hit-and-run');
  assert.deepEqual(loaded?.tacticalBattleReport?.tactics?.flankRoutes.map(route => ({
    side: route.side, outcome: route.outcome, engagements: route.engagements,
  })), [{ side: 'left', outcome: 'defenderHeld', engagements: 2 }]);
}

console.log('resource save migration tests passed');
