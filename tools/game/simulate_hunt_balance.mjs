import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-hunt-balance-'));
  for (const file of readdirSync(srcDir).filter(candidate => candidate.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, specifier, end) =>
      /\.[cm]?js$/.test(specifier) ? `${start}${specifier}${end}` : `${start}${specifier}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const PARTY_COMPOSITIONS = {
  2: { muskets: 0, bows: 0, spears: 1, unarmedMilitia: 0, watchmen: 0, hunters: 1, civilians: 0 },
  4: { muskets: 1, bows: 1, spears: 1, unarmedMilitia: 0, watchmen: 0, hunters: 1, civilians: 0 },
  6: { muskets: 1, bows: 1, spears: 2, unarmedMilitia: 0, watchmen: 1, hunters: 1, civilians: 0 },
};

const BASE_COHORTS = [
  ...['tiger', 'greatTiger', 'mountainLord'].flatMap(tier =>
    Object.keys(PARTY_COMPOSITIONS).map(partySize => ({
      scenario: 'tigerHunt',
      predator: tier,
      tigerTier: tier,
      partySize: Number(partySize),
    }))),
  ...Object.keys(PARTY_COMPOSITIONS).map(partySize => ({
    scenario: 'wolfHunt',
    predator: 'wolfPack6',
    wolfCount: 6,
    partySize: Number(partySize),
  })),
];

const DEPLOYMENTS = ['spread', 'twoSector', 'stacked'];
const COHORTS = BASE_COHORTS.flatMap((cohort, baseCohortIndex) =>
  DEPLOYMENTS.map(deployment => ({ ...cohort, deployment, baseCohortIndex })));

function prepareDeployment(tacticalHunt, state, deployment) {
  const battle = state.tacticalBattle;
  const sectorIds = battle.zones.filter(zone => zone.id !== 'huntDen').map(zone => zone.id);
  const desiredSectorCount = deployment === 'spread' ? 3 : deployment === 'twoSector' ? 2 : 1;
  while (battle.defenderGroups.length < Math.min(desiredSectorCount, battle.defenderGroups.reduce(
    (sum, group) => sum + group.count, 0))) {
    const splittable = battle.defenderGroups
      .filter(group => group.count >= 2 && group.wounded === 0 && group.killed === 0)
      .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id))[0];
    if (!splittable) break;
    assert.equal(tacticalHunt.splitHuntGroup(state, splittable.id, Math.floor(splittable.count / 2)), null);
  }
  battle.defenderGroups.forEach((group, index) => {
    assert.equal(tacticalHunt.assignHuntGroup(state, group.id, sectorIds[index % desiredSectorCount]), null);
  });
}

function advanceToCommand(tactical, tacticalHunt, state, deployment) {
  const battle = state.tacticalBattle;
  assert.ok(battle);
  for (let guard = 0; guard < 5 && battle.phase !== 'command'; guard += 1) {
    if (battle.phase === 'deployment') prepareDeployment(tacticalHunt, state, deployment);
    assert.equal(tactical.advanceTacticalPhase(state), null);
  }
  assert.equal(battle.phase, 'command');
}

function runBattle(tactical, tacticalHunt, battleSimulation, huntConfig, cohort, seed) {
  const state = battleSimulation.createBattleSimulation({
    scenario: cohort.scenario,
    mode: 'garrison',
    factionName: '변경 맹수',
    power: 60,
    warned: false,
    siege: false,
    season: 'autumn',
    weather: 'clear',
    prepPoints: 'auto',
    defenders: PARTY_COMPOSITIONS[cohort.partySize],
    cannonEmplacements: 0,
    tigerTier: cohort.tigerTier,
    wolfCount: cohort.wolfCount,
    seed,
  });
  const battle = state.tacticalBattle;
  assert.ok(battle);
  advanceToCommand(tactical, tacticalHunt, state, cohort.deployment);
  for (let guard = 0; guard < 20 && battle.phase === 'command'; guard += 1) {
    assert.equal(tactical.resolveTacticalRound(state), null);
    assert.equal(tactical.completeTacticalSimulation(state), null);
    assert.equal(tactical.acknowledgeTacticalReport(state), null);
  }
  assert.equal(battle.phase, 'finished');
  return {
    outcome: battle.reports.at(-1)?.outcome,
    casualties: battle.defenderGroups.reduce((sum, group) => sum + group.wounded + group.killed, 0),
    rounds: battle.reports.length,
    escapeCause: battle.huntEscapeCause,
    counterattacks: battle.huntCounterattackCount ?? 0,
    finalEncirclement: battle.huntEncirclement ?? 0,
    finalOpenSectors: battle.zones.filter(zone => zone.id !== 'huntDen' &&
      (zone.sectorBlockade ?? 0) < huntConfig.sectors.blockadeThreshold).length,
  };
}

function summarize(cohort, results) {
  const count = outcome => results.filter(result => result.outcome === outcome).length;
  const rate = outcome => count(outcome) / results.length;
  return {
    predator: cohort.predator,
    partySize: cohort.partySize,
    deployment: cohort.deployment,
    battles: results.length,
    killRate: rate('huntKill'),
    repelRate: rate('huntRepelled'),
    escapeRate: rate('huntEscaped'),
    defeatRate: rate('huntDefeat'),
    averageCasualties: results.reduce((sum, result) => sum + result.casualties, 0) / results.length,
    averageRounds: results.reduce((sum, result) => sum + result.rounds, 0) / results.length,
    averageCounterattacks: results.reduce((sum, result) => sum + result.counterattacks, 0) / results.length,
    averageFinalEncirclement: results.reduce((sum, result) => sum + result.finalEncirclement, 0) / results.length,
    averageFinalOpenSectors: results.reduce((sum, result) => sum + result.finalOpenSectors, 0) / results.length,
    openSectorEscapeRate: results.filter(result => result.escapeCause === 'openSector').length / results.length,
    breakoutEscapeRate: results.filter(result => result.escapeCause === 'breakout').length / results.length,
    timeoutEscapeRate: results.filter(result => result.escapeCause === 'timeout').length / results.length,
  };
}

function display(summary) {
  return summary.map(row => ({
    predator: row.predator,
    party: row.partySize,
    deployment: row.deployment,
    battles: row.battles,
    killed: `${(row.killRate * 100).toFixed(1)}%`,
    repelled: `${(row.repelRate * 100).toFixed(1)}%`,
    escaped: `${(row.escapeRate * 100).toFixed(1)}%`,
    defeated: `${(row.defeatRate * 100).toFixed(1)}%`,
    casualties: row.averageCasualties.toFixed(2),
    rounds: row.averageRounds.toFixed(2),
    encirclement: row.averageFinalEncirclement.toFixed(1),
    holes: row.averageFinalOpenSectors.toFixed(1),
    openEscape: `${(row.openSectorEscapeRate * 100).toFixed(0)}%`,
    breakout: `${(row.breakoutEscapeRate * 100).toFixed(0)}%`,
    timeout: `${(row.timeoutEscapeRate * 100).toFixed(0)}%`,
  }));
}

const runsArgument = process.argv.find(argument => argument.startsWith('--runs='));
const runs = Math.max(1, Number(runsArgument?.slice('--runs='.length) ?? 40));
const compiledDir = compileGameModules();
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const tacticalHunt = await import(pathToFileURL(join(compiledDir, 'tacticalHunt.mjs')).href);
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);
const config = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);
const summary = COHORTS.map(cohort => {
  const results = Array.from({ length: runs }, (_unused, runIndex) =>
    runBattle(tactical, tacticalHunt, battleSimulation, config.CONFIG.tacticalBattle.hunt,
      cohort, 2026071500 + cohort.baseCohortIndex * 1000 + runIndex));
  return summarize(cohort, results);
});

if (process.argv.includes('--json')) console.log(JSON.stringify(summary, null, 2));
else console.table(display(summary));
