import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-support-tests-'));
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
const support = await import(pathToFileURL(join(compiledDir, 'tacticalSupport.mjs')).href);
const engagement = await import(pathToFileURL(join(compiledDir, 'tacticalEngagement.mjs')).href);
const units = await import(pathToFileURL(join(compiledDir, 'tacticalUnits.mjs')).href);
const enemyPlan = await import(pathToFileURL(join(compiledDir, 'enemyPlan.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);

function raider(unitType, overrides = {}) {
  return {
    id: unitType, kind: 'main', unitType, label: unitType, zoneId: 'wall', line: 'rear',
    targetZoneId: 'wall', power: 30, maximumPower: 30, count: 6, killed: 0, morale: 90,
    intent: 'advance', revealed: true, engagementsInZone: 0,
    supportState: support.createTacticalRaiderSupportState(unitType, 'wall'),
    ...overrides,
  };
}

function defender(count = 10) {
  return {
    id: `def-${count}`, kind: 'militia-spear', role: 'militia', weapon: 'spear', readyMuskets: 0,
    label: '창 민병', baseLabel: '창 민병', deploymentCohortId: `def-${count}`, residentIds: [],
    count, zoneId: 'wall', command: 'hold', power: 20, wounded: 0, killed: 0, line: 'front',
    facing: 'towardEnemy',
  };
}

function battle(groups, defenders = [defender()]) {
  return {
    round: 1, initialEnemyPower: groups.reduce((sum, group) => sum + (group.maximumPower ?? group.power), 0),
    raiderGroups: groups, defenderGroups: defenders,
  };
}

assert.equal(units.tacticalUnitProfile('court-medic').enabled, true);
assert.equal(units.tacticalUnitProfile('court-hwacha').enabled, true);
assert.equal(enemyPlan.enemyDoctrineDefinition('fireSupport').enabled, true);

{
  const artillery = raider('court-artillery');
  const current = battle([artillery]);
  const events = [];
  support.prepareTacticalRaiderSupportRound(current, events, []);
  assert.equal(artillery.supportState.firing, true);
  assert.equal(artillery.supportState.shotsRemaining, 2);
  assert.equal(artillery.supportState.readyOnRound, 3, 'direct artillery spends one full round reloading');
  assert.equal(support.tacticalSupportUnitView(current, artillery).status, 'firing');
  current.round = 2;
  support.prepareTacticalRaiderSupportRound(current, events, []);
  assert.equal(artillery.supportState.firing, false);
  assert.equal(support.tacticalSupportUnitView(current, artillery).status, 'reloading');
  current.round = 3;
  support.prepareTacticalRaiderSupportRound(current, events, []);
  assert.equal(artillery.supportState.firing, true);
  artillery.zoneId = 'storehouse';
  current.round = 4;
  support.prepareTacticalRaiderSupportRound(current, events, []);
  assert.equal(artillery.supportState.firing, false, 'moving forces a direction-setting round');
  assert.equal(artillery.supportState.facingZoneId, 'storehouse');
}

{
  const hwacha = raider('court-hwacha');
  const dense = engagement.tacticalAttackerMatchupMultiplier(hwacha, [defender(10)],
    { id: 'wall', kind: 'wall' }, 'frontal');
  hwacha.supportState.firing = true;
  const firingDense = engagement.tacticalAttackerMatchupMultiplier(hwacha, [defender(10)],
    { id: 'wall', kind: 'wall' }, 'frontal');
  const firingSparse = engagement.tacticalAttackerMatchupMultiplier(hwacha, [defender(3)],
    { id: 'wall', kind: 'wall' }, 'frontal');
  assert.ok(firingDense > firingSparse, 'hwacha rewards dense targets');
  assert.ok(firingSparse > dense, 'even sparse fire is stronger than reloading crew defense');
}

{
  const medic = raider('court-medic', { power: 12, maximumPower: 12, count: 3 });
  const wounded = raider('court-gunner', { power: 12, maximumPower: 30, count: 6, killed: 2, supportState: undefined });
  const current = battle([medic, wounded], []);
  const killedBefore = wounded.killed;
  const restored = support.applyTacticalRaiderSupportTreatment(current, [], []);
  assert.ok(restored > 0);
  assert.equal(wounded.killed, killedBefore, 'support never resurrects killed fighters');
  assert.ok(wounded.power <= wounded.maximumPower * (wounded.count - wounded.killed) / wounded.count,
    'recovery cannot exceed surviving capacity');
  for (let i = 0; i < 20; i += 1) support.applyTacticalRaiderSupportTreatment(current, [], []);
  assert.ok(medic.supportState.totalRestored <= current.initialEnemyPower * 0.1 + 1e-9,
    'battle-wide treatment stays within the ten-percent balance gate');
}

{
  const artillery = raider('court-artillery');
  const rear = engagement.tacticalRaiderLossMatchupMultiplier(artillery, [defender()], 'rear');
  const front = engagement.tacticalRaiderLossMatchupMultiplier(artillery, [defender()], 'frontal');
  assert.ok(rear > front, 'rear raids punish exposed support units');
}

assert.ok(Number.isInteger(saveLoad.CURRENT_SCHEMA_VERSION) && saveLoad.CURRENT_SCHEMA_VERSION >= 30,
  'current saves retain the tactical support migrations and may add newer schema steps');
assert.equal(saveLoad.migrateV28ToV29({ schemaVersion: 28, marker: 'kept' }).marker, 'kept');
assert.equal(saveLoad.migrateV29ToV30({ schemaVersion: 29, marker: 'kept' }).marker, 'kept');

console.log('tactical support unit tests passed');
