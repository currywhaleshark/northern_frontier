import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-rear-engagement-balance-'));
  for (const file of readdirSync(srcDir).filter(candidate => candidate.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
      if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
      return `${start}${spec}.mjs${end}`;
    });
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const DEFENDERS = {
  muskets: 3,
  bows: 3,
  spears: 4,
  unarmedMilitia: 1,
  watchmen: 2,
  hunters: 3,
  civilians: 6,
};

const MODES = ['rearGuard', 'preparedRearGuard', 'middleReserve', 'unopposed'];

function runExchange(tactical, enemyPlan, tacticalEngagement, battleSimulation, seed, mode, applyDynamicCounter) {
  const state = battleSimulation.createBattleSimulation({
    mode: 'garrison',
    factionName: '변경 마적',
    power: 84,
    warned: true,
    siege: true,
    season: 'winter',
    weather: 'clear',
    prepPoints: 'auto',
    defenders: DEFENDERS,
    cannonEmplacements: 0,
    seed,
  });
  const battle = state.tacticalBattle;
  const spear = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  const civilians = battle.defenderGroups.find(group => group.kind === 'civilian');
  const flanker = battle.raiderGroups.find(group => group.kind === 'flankers');
  const zone = battle.zones.find(candidate => candidate.id === 'center');
  assert.ok(spear && civilians && flanker && zone);

  const rearDefenders = [{ ...civilians, zoneId: zone.id, line: 'rear', command: null }];
  if (mode === 'rearGuard' || mode === 'preparedRearGuard') {
    rearDefenders.unshift({ ...spear, zoneId: zone.id, line: 'rear', command: 'hold' });
  }
  if (mode === 'middleReserve') {
    rearDefenders.unshift({ ...spear, zoneId: zone.id, line: 'middle', command: 'reinforceRear' });
  }
  const rearAttackers = [{
    ...flanker,
    zoneId: zone.id,
    rearAssault: true,
    morale: 100,
    confused: false,
    intent: 'flank',
  }];
  const stratagem = {
    id: 'rearManeuver', revealed: true, counterLevel: mode === 'preparedRearGuard' ? 1 : 0,
    counter: mode === 'preparedRearGuard' ? { preparation: 0.6 } : {},
  };
  const counterBattle = {
    ...battle,
    defenderGroups: rearDefenders,
    raiderGroups: rearAttackers,
    enemyPlan: {
      objective: 'breakthrough', objectiveRevealed: true, stratagemPoints: 2,
      stratagems: [stratagem],
    },
  };
  const formationCounter = tactical.tacticalRearManeuverFormationCounterForEngagement(
    counterBattle,
    zone.id,
    rearAttackers,
    rearDefenders,
  );
  const effectScale = enemyPlan.enemyStratagemEffectScaleForEngagement(stratagem, formationCounter);
  const counterStrength = 1 - effectScale;
  const counteredCombatPenalty = applyDynamicCounter ? 0.25 * counterStrength : 0;
  const effectiveAttackers = rearAttackers.map(group => ({
    ...group,
    combatMultiplier: (group.combatMultiplier ?? 1) * (1 - counteredCombatPenalty),
  }));
  const exchange = tacticalEngagement.resolveEngagementExchange({
    zone: { ...zone, pressure: 45, civilianRisk: 100 },
    defenders: rearDefenders,
    attackers: effectiveAttackers,
    direction: 'rear',
    weather: 'clear',
    prepareVolleyApplied: false,
    evacuateCiviliansApplied: false,
    roundStartingRaiderPower: flanker.power,
    rng: seededRandom(seed),
  });
  const civilianLoss = exchange.defenderLosses.find(loss => loss.groupId === civilians.id);
  const combatLoss = exchange.defenderLosses.find(loss => loss.groupId === spear.id);
  const raiderLoss = exchange.raiderLosses.find(loss => loss.groupId === flanker.id);
  assert.ok(civilianLoss && raiderLoss);
  return {
    combatCasualties: (combatLoss?.wounded ?? 0) + (combatLoss?.killed ?? 0),
    civilianCasualties: civilianLoss.wounded + civilianLoss.killed,
    enemyKills: raiderLoss.killed,
    enemyPowerAfter: raiderLoss.powerAfter,
    enemyShare: exchange.enemyShare,
    villageMoraleDelta: exchange.villageMoraleDelta,
    formationCounter,
    counterStrength,
    counteredCombatPenalty,
  };
}

function average(results, key) {
  return results.reduce((sum, result) => sum + result[key], 0) / results.length;
}

function summarize(results) {
  return {
    exchanges: results.length,
    averageCombatCasualties: average(results, 'combatCasualties'),
    averageCivilianCasualties: average(results, 'civilianCasualties'),
    averageEnemyKills: average(results, 'enemyKills'),
    averageEnemyPowerAfter: average(results, 'enemyPowerAfter'),
    averageEnemyShare: average(results, 'enemyShare'),
    averageVillageMoraleDelta: average(results, 'villageMoraleDelta'),
    averageFormationCounter: average(results, 'formationCounter'),
    averageCounterStrength: average(results, 'counterStrength'),
    averageCounteredCombatPenalty: average(results, 'counteredCombatPenalty'),
  };
}

const compiledDir = compileGameModules();
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const enemyPlan = await import(pathToFileURL(join(compiledDir, 'enemyPlan.mjs')).href);
const tacticalEngagement = await import(pathToFileURL(join(compiledDir, 'tacticalEngagement.mjs')).href);
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);
const measure = applyDynamicCounter => Object.fromEntries(MODES.map(mode => [
  mode,
  summarize(Array.from({ length: 20 }, (_unused, index) => runExchange(
    tactical,
    enemyPlan,
    tacticalEngagement,
    battleSimulation,
    2026071466 + index,
    mode,
    applyDynamicCounter,
  ))),
]));
const exposureOnly = measure(false);
const measurements = measure(true);

assert.ok(measurements.rearGuard.averageCivilianCasualties < measurements.middleReserve.averageCivilianCasualties);
assert.ok(measurements.middleReserve.averageCivilianCasualties < measurements.unopposed.averageCivilianCasualties);
assert.ok(measurements.rearGuard.averageEnemyPowerAfter < measurements.middleReserve.averageEnemyPowerAfter);
assert.ok(measurements.middleReserve.averageEnemyPowerAfter < measurements.unopposed.averageEnemyPowerAfter);
assert.equal(measurements.unopposed.averageFormationCounter, 0);
assert.equal(measurements.unopposed.averageCounteredCombatPenalty, 0);
assert.ok(measurements.unopposed.averageCivilianCasualties > 0,
  'an unopposed rear assault remains dangerous to civilians');
assert.ok(measurements.rearGuard.averageFormationCounter > 0 &&
  measurements.rearGuard.averageFormationCounter < 1,
  'a live rear guard meaningfully counters but does not nullify the maneuver');
assert.ok(measurements.preparedRearGuard.averageCounterStrength > measurements.rearGuard.averageCounterStrength,
  'preparation combines with the live formation counter');
assert.ok(measurements.preparedRearGuard.averageCounteredCombatPenalty < 0.25,
  'combined preparation and formation remain below the maximum combat penalty');
assert.ok(measurements.preparedRearGuard.averageCivilianCasualties <= measurements.rearGuard.averageCivilianCasualties,
  'preparation never makes the guarded rear engagement more dangerous');

console.log(JSON.stringify({ exposureOnly, dynamicCounter: measurements }, null, 2));
