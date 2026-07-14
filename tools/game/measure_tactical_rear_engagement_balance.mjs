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

const MODES = ['rearGuard', 'middleReserve', 'unopposed'];

function runExchange(tacticalEngagement, battleSimulation, seed, mode) {
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

  const rearDefenders = [{ ...civilians, line: 'rear', command: null }];
  if (mode === 'rearGuard') rearDefenders.unshift({ ...spear, line: 'rear', command: 'hold' });
  if (mode === 'middleReserve') {
    rearDefenders.unshift({ ...spear, line: 'middle', command: 'reinforceRear' });
  }
  const exchange = tacticalEngagement.resolveEngagementExchange({
    zone: { ...zone, pressure: 45, civilianRisk: 100 },
    defenders: rearDefenders,
    attackers: [{ ...flanker, rearAssault: true, morale: 100, confused: false }],
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
  };
}

const compiledDir = compileGameModules();
const tacticalEngagement = await import(pathToFileURL(join(compiledDir, 'tacticalEngagement.mjs')).href);
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);
const measurements = Object.fromEntries(MODES.map(mode => [
  mode,
  summarize(Array.from({ length: 20 }, (_unused, index) =>
    runExchange(tacticalEngagement, battleSimulation, 2026071466 + index, mode))),
]));

assert.ok(measurements.rearGuard.averageCivilianCasualties < measurements.middleReserve.averageCivilianCasualties);
assert.ok(measurements.middleReserve.averageCivilianCasualties < measurements.unopposed.averageCivilianCasualties);
assert.ok(measurements.rearGuard.averageEnemyPowerAfter < measurements.middleReserve.averageEnemyPowerAfter);
assert.ok(measurements.middleReserve.averageEnemyPowerAfter < measurements.unopposed.averageEnemyPowerAfter);

console.log(JSON.stringify(measurements, null, 2));
