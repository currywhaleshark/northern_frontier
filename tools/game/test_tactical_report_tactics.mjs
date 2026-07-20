import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-report-tests-'));
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
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);

const state = battleSimulation.createBattleSimulation({
  scenario: 'defense', mode: 'garrison', factionName: '변경 마적', power: 90,
  warned: true, siege: false, season: 'spring', weather: 'clear', prepPoints: 6,
  defenders: { muskets: 2, bows: 2, spears: 4, unarmedMilitia: 1, watchmen: 0, hunters: 0, civilians: 6 },
  cannonEmplacements: 0, enemyDoctrine: 'mountedSkirmish',
  enemyCompositionTemplateId: 'bandit-hit-and-run', enemyFlankRoute: 'left', seed: 2026072401,
});
const battle = state.tacticalBattle;
const left = battle.flankRoutes.find(route => route.side === 'left');
const right = battle.flankRoutes.find(route => route.side === 'right');
right.openedByDefender = true;
left.control = 'raider';
right.control = 'defender';
battle.reports = [{
  round: 1,
  focusZoneId: 'wall',
  nextFocusZoneId: 'wall',
  summary: '전투 종료',
  lines: [],
  events: [],
  routeEngagements: [
    {
      routeId: left.id, defenderGroupIds: ['def-left'], raiderGroupIds: ['raid-left'],
      outcome: 'raiderBreakthrough', defenderLosses: 1, raiderLosses: 0,
      defenderRetreated: true, raiderRetreated: false, lines: [],
    },
    {
      routeId: right.id, defenderGroupIds: ['def-right'], raiderGroupIds: ['raid-right'],
      outcome: 'defenderHeld', defenderLosses: 0, raiderLosses: 2,
      defenderRetreated: false, raiderRetreated: true, lines: [],
    },
  ],
  routeArrivals: [
    { routeId: left.id, groupId: 'raid-left', side: 'raider', destinationZoneId: 'storehouse', rearAssault: true },
    { routeId: right.id, groupId: 'def-right', side: 'defender', destinationZoneId: 'approach', rearAssault: true },
  ],
  wounded: 0,
  killed: 0,
  raidersKilled: 0,
  loot: {},
  buildingsDamaged: 0,
  villageMoraleDelta: 0,
  raiderMoraleDelta: 0,
  ended: true,
  outcome: 'defenseSuccess',
}];

const tactics = tactical.tacticalBattleTacticsReport(battle);
assert.deepEqual({
  doctrineId: tactics.doctrineId,
  doctrineLabel: tactics.doctrineLabel,
  compositionTemplateId: tactics.compositionTemplateId,
  compositionLabel: tactics.compositionLabel,
}, {
  doctrineId: 'mountedSkirmish',
  doctrineLabel: '기마 견제',
  compositionTemplateId: 'bandit-hit-and-run',
  compositionLabel: '치고 빠지는 약탈대',
});
assert.deepEqual(tactics.flankRoutes.map(route => ({
  side: route.side,
  outcome: route.outcome,
  engagements: route.engagements,
  defenderArrivals: route.defenderArrivals,
  raiderArrivals: route.raiderArrivals,
})), [
  { side: 'left', outcome: 'raiderReachedRear', engagements: 1, defenderArrivals: 0, raiderArrivals: 1 },
  { side: 'right', outcome: 'defenderReachedRear', engagements: 1, defenderArrivals: 1, raiderArrivals: 0 },
]);
assert.match(tactics.flankRoutes[0].summary, /적 우회대 1개 조가 아군 후열에 도달/);
assert.match(tactics.flankRoutes[1].summary, /아군 우회대 1개 조가 적 후열에 도달/);

tactical.finishTacticalBattle(state);
assert.equal(state.tacticalBattle, null);
assert.equal(state.tacticalBattleReport.tactics.doctrineId, 'mountedSkirmish');
assert.equal(state.tacticalBattleReport.tactics.compositionTemplateId, 'bandit-hit-and-run');
assert.deepEqual(state.tacticalBattleReport.tactics.flankRoutes.map(route => route.outcome), [
  'raiderReachedRear', 'defenderReachedRear',
]);

console.log('tactical report tactics tests passed');
