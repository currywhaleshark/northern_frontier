import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-healer-balance-'));
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
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function run(seed, returnsPerPhysician) {
  const state = simulation.newGame(seed);
  for (const resident of state.residents) {
    resident.job = 'idle';
    resident.alive = true;
    resident.sick = false;
    resident.health = 100;
    resident.quarantinedUntil = 0;
  }
  state.residents.slice(0, 6).forEach(resident => { resident.job = 'militia'; });
  state.residents.slice(6, 8).forEach(resident => { resident.job = 'watchman'; });
  state.residents.slice(8, 10).forEach(resident => { resident.job = 'hunter'; });
  state.residents[10].job = 'physician';
  state.resources.spears = 3;
  state.resources.hornBows = 3;
  state.resources.muskets = 2;
  state.resources.gunpowder = 20;
  state.resources.herbs = 12;
  state.weaponAllocationMode = 'auto';
  CONFIG.medicine.tacticalReturnsPerPhysicianPerRound = returnsPerPhysician;

  const battle = tactical.createTacticalBattle(state, {
    factionName: '변경 마적', power: 92, warned: true, siege: true, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  tactical.advanceTacticalPhase(state);
  while (battle.phase === 'command') {
    tactical.resolveTacticalRound(state);
    if (battle.pendingReport?.ended) break;
    tactical.completeTacticalSimulation(state);
    tactical.acknowledgeTacticalReport(state);
  }
  return {
    wounded: battle.defenderGroups.reduce((sum, group) => sum + group.wounded, 0),
    killed: battle.defenderGroups.reduce((sum, group) => sum + group.killed, 0),
    treated: battle.reports.reduce((sum, report) => sum + (report.treated ?? 0), 0),
    herbsSpent: 12 - state.resources.herbs,
  };
}

const seeds = Array.from({ length: 80 }, (_, index) => 2026071700 + index);
const baseline = { wounded: 0, killed: 0, treated: 0, herbsSpent: 0 };
const healer = { wounded: 0, killed: 0, treated: 0, herbsSpent: 0 };
for (const seed of seeds) {
  for (const [target, result] of [[baseline, run(seed, 0)], [healer, run(seed, 1)]]) {
    target.wounded += result.wounded;
    target.killed += result.killed;
    target.treated += result.treated;
    target.herbsSpent += result.herbsSpent;
  }
}
const baselineCasualties = baseline.wounded + baseline.killed;
const healerCasualties = healer.wounded + healer.killed;
const changePercent = baselineCasualties > 0
  ? (healerCasualties - baselineCasualties) / baselineCasualties * 100
  : 0;

console.log(JSON.stringify({
  seeds: seeds.length,
  baseline: { ...baseline, casualties: baselineCasualties },
  healer: { ...healer, casualties: healerCasualties },
  casualtyChangePercent: Number(changePercent.toFixed(2)),
}, null, 2));
