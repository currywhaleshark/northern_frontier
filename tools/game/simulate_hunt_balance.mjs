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

const COHORTS = [
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

function advanceToCommand(tactical, state) {
  const battle = state.tacticalBattle;
  assert.ok(battle);
  for (let guard = 0; guard < 4 && battle.phase !== 'command'; guard += 1) {
    assert.equal(tactical.advanceTacticalPhase(state), null);
  }
  assert.equal(battle.phase, 'command');
}

function runBattle(tactical, battleSimulation, cohort, seed) {
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
  advanceToCommand(tactical, state);
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
  };
}

function summarize(cohort, results) {
  const count = outcome => results.filter(result => result.outcome === outcome).length;
  const rate = outcome => count(outcome) / results.length;
  return {
    predator: cohort.predator,
    partySize: cohort.partySize,
    battles: results.length,
    killRate: rate('huntKill'),
    repelRate: rate('huntRepelled'),
    escapeRate: rate('huntEscaped'),
    defeatRate: rate('huntDefeat'),
    averageCasualties: results.reduce((sum, result) => sum + result.casualties, 0) / results.length,
    averageRounds: results.reduce((sum, result) => sum + result.rounds, 0) / results.length,
  };
}

function display(summary) {
  return summary.map(row => ({
    predator: row.predator,
    party: row.partySize,
    battles: row.battles,
    killed: `${(row.killRate * 100).toFixed(1)}%`,
    repelled: `${(row.repelRate * 100).toFixed(1)}%`,
    escaped: `${(row.escapeRate * 100).toFixed(1)}%`,
    defeated: `${(row.defeatRate * 100).toFixed(1)}%`,
    casualties: row.averageCasualties.toFixed(2),
    rounds: row.averageRounds.toFixed(2),
  }));
}

const runsArgument = process.argv.find(argument => argument.startsWith('--runs='));
const runs = Math.max(1, Number(runsArgument?.slice('--runs='.length) ?? 40));
const compiledDir = compileGameModules();
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);
const summary = COHORTS.map((cohort, cohortIndex) => {
  const results = Array.from({ length: runs }, (_unused, runIndex) =>
    runBattle(tactical, battleSimulation, cohort, 2026071500 + cohortIndex * 1000 + runIndex));
  return summarize(cohort, results);
});

if (process.argv.includes('--json')) console.log(JSON.stringify(summary, null, 2));
else console.table(display(summary));

