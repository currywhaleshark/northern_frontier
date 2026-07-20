import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-route-balance-'));
  for (const file of readdirSync(srcDir).filter(candidate => candidate.endsWith('.ts'))) {
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

function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const compiledDir = compileGameModules();
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const routes = await import(pathToFileURL(join(compiledDir, 'tacticalRoutes.mjs')).href);

function create(seed) {
  return battleSimulation.createBattleSimulation({
    scenario: 'defense', mode: 'garrison', factionName: '변경 마적', power: 130,
    warned: true, siege: false, season: 'spring', weather: 'clear', prepPoints: 6,
    defenders: { muskets: 2, bows: 2, spears: 2, unarmedMilitia: 0, watchmen: 0, hunters: 0, civilians: 0 },
    cannonEmplacements: 0, enemyFlankRoute: 'left', seed,
  });
}

function routeExchange(seed, weapon) {
  const state = create(seed);
  const battle = state.tacticalBattle;
  tactical.toggleTacticalFlankRoutePreparation(state, 'left');
  tactical.advanceTacticalPhase(state);
  if (battle.phase === 'preparationExecution') tactical.advanceTacticalPhase(state);
  tactical.applyAutoDeployTacticalGroups(battle);
  const blocker = battle.defenderGroups.find(group => group.weapon === weapon);
  assert.ok(blocker);
  const flanker = battle.raiderGroups.find(group => group.routeTransit);
  assert.ok(flanker);
  flanker.unitType = 'bandit-rider';
  assert.equal(tactical.placeTacticalRouteBlocker(state, blocker.id, 'left'), null);
  tactical.advanceTacticalPhase(state);
  const advances = routes.advanceTacticalRouteTransits(battle);
  const resolution = routes.resolveTacticalRouteRound(battle, advances, state.weather, rng(seed));
  const engagement = resolution.engagements[0];
  assert.ok(engagement);
  return {
    held: engagement.outcome === 'defenderHeld',
    broke: engagement.outcome === 'raiderBreakthrough',
    defenderLosses: engagement.defenderLosses,
    raiderLosses: engagement.raiderLosses,
  };
}

function summarize(entries) {
  const average = key => entries.reduce((sum, entry) => sum + Number(entry[key]), 0) / entries.length;
  return {
    samples: entries.length,
    heldRate: average('held'),
    breakthroughRate: average('broke'),
    averageDefenderLosses: average('defenderLosses'),
    averageRaiderLosses: average('raiderLosses'),
  };
}

const seeds = Array.from({ length: 40 }, (_unused, index) => 2026072300 + index);
const spearBlock = summarize(seeds.map(seed => routeExchange(seed, 'spear')));
const bowBlock = summarize(seeds.map(seed => routeExchange(seed, 'hornBow')));
const musketBlock = summarize(seeds.map(seed => routeExchange(seed, 'musket')));

console.log(JSON.stringify({ spearBlock, bowBlock, musketBlock }, null, 2));

assert.ok(spearBlock.averageRaiderLosses > bowBlock.averageRaiderLosses,
  'spear blockers should inflict more losses on a mounted route attack than isolated bows');
assert.ok(spearBlock.averageRaiderLosses > musketBlock.averageRaiderLosses,
  'spear blockers should inflict more losses on a mounted route attack than isolated muskets');
assert.ok(bowBlock.averageDefenderLosses > spearBlock.averageDefenderLosses,
  'isolated ranged blockers must pay at least the spear blocker casualty cost');
assert.ok(musketBlock.averageDefenderLosses > spearBlock.averageDefenderLosses,
  'isolated gunner blockers must pay at least the spear blocker casualty cost');
assert.ok(spearBlock.heldRate < 1,
  'even the recommended spear blockade must retain a non-zero breakthrough risk');
