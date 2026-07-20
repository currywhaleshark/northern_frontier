import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-golden-'));
  const files = readdirSync(srcDir).filter(file => file.endsWith('.ts'));
  for (const file of files) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
      if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
      return `${start}${spec}.mjs${end}`;
    });
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const SCENARIOS = [
  { id: 'nimacha-unwarned-front', factionName: '니마차 우디캐', power: 68, warned: false, rearAssault: false, seed: 2026071401, doctrine: 'missileSuppression', composition: 'nimacha-forest-screen' },
  { id: 'nimacha-warned-rear', factionName: '니마차 우디캐', power: 74, warned: true, rearAssault: true, seed: 2026071402, doctrine: 'missileSuppression', composition: 'nimacha-forest-screen' },
  { id: 'holaon-unwarned-rear', factionName: '홀라온 야인', power: 78, warned: false, rearAssault: true, seed: 2026071403, doctrine: 'mountedSkirmish', composition: 'holaon-mounted-skirmish' },
  { id: 'holaon-warned-front', factionName: '홀라온 야인', power: 84, warned: true, rearAssault: false, seed: 2026071404, doctrine: 'mountedSkirmish', composition: 'holaon-mounted-skirmish' },
  { id: 'bandit-unwarned-rear', factionName: '변경 마적', power: 82, warned: false, rearAssault: true, seed: 2026071405, doctrine: 'mountedSkirmish', composition: 'bandit-hit-and-run' },
  { id: 'court-warned-front', factionName: '조정 토벌군', power: 154, warned: true, rearAssault: false, seed: 2026071406, doctrine: 'shockBreakthrough', composition: 'court-cavalry-wing' },
];

const DEFENDERS = {
  muskets: 3,
  bows: 3,
  spears: 4,
  unarmedMilitia: 1,
  watchmen: 2,
  hunters: 3,
  civilians: 6,
};

function groupCasualties(group) {
  return {
    id: group.id,
    wounded: group.wounded,
    killed: group.killed,
  };
}

function raiderState(group) {
  return {
    id: group.id,
    killed: group.killed,
    power: group.power,
    morale: group.morale,
    zoneId: group.zoneId,
    pendingZoneId: group.pendingZoneId ?? null,
    intent: group.intent,
    rearAssault: group.rearAssault ?? false,
  };
}

function zoneState(zone) {
  return {
    id: zone.id,
    pressure: zone.pressure,
    breached: zone.breached,
  };
}

function snapshotRound(battle, report) {
  return {
    round: report.round,
    focusZoneId: report.focusZoneId,
    nextFocusZoneId: report.nextFocusZoneId,
    defenders: battle.defenderGroups.map(groupCasualties),
    raiders: battle.raiderGroups.map(raiderState),
    zones: battle.zones.map(zoneState),
    villageMorale: battle.villageMorale,
    raiderMorale: battle.raiderMorale,
    villageMoraleDelta: report.villageMoraleDelta,
    raiderMoraleDelta: report.raiderMoraleDelta,
    wounded: report.wounded,
    killed: report.killed,
    raidersKilled: report.raidersKilled,
    buildingsDamaged: report.buildingsDamaged,
    loot: report.loot,
    summary: report.summary,
    lines: report.lines,
    events: report.events.map(event => ({
      zoneId: event.zoneId,
      kind: event.kind,
      groupId: event.groupId ?? null,
    })),
    ended: report.ended ?? false,
    outcome: report.outcome ?? null,
  };
}

function advanceToCommand(tactical, state) {
  const battle = state.tacticalBattle;
  for (let guard = 0; guard < 4 && battle.phase !== 'command'; guard += 1) {
    if (battle.phase === 'deployment') tactical.applyAutoDeployTacticalGroups(battle);
    const error = tactical.advanceTacticalPhase(state);
    assert.equal(error, null);
  }
  assert.equal(battle.phase, 'command');
}

function runScenario(tactical, battleSimulation, scenario) {
  const state = battleSimulation.createBattleSimulation({
    mode: 'garrison',
    factionName: scenario.factionName,
    power: scenario.power,
    warned: scenario.warned,
    siege: true,
    season: 'winter',
    weather: 'clear',
    prepPoints: 'auto',
    defenders: DEFENDERS,
    cannonEmplacements: 0,
    enemyDoctrine: scenario.doctrine,
    enemyCompositionTemplateId: scenario.composition,
    enemyFlankRoute: scenario.rearAssault ? 'left' : 'none',
    seed: scenario.seed,
  });
  const battle = state.tacticalBattle;
  assert.ok(battle);
  assert.ok(battle.raiderGroups.some(group => group.kind === 'flankers'), 'golden scenarios require a flanker group');
  advanceToCommand(tactical, state);

  const rounds = [];
  for (let guard = 0; guard < 10 && battle.phase === 'command'; guard += 1) {
    assert.equal(tactical.resolveTacticalRound(state), null);
    assert.equal(battle.phase, 'simulating');
    assert.ok(battle.pendingReport);
    rounds.push(snapshotRound(battle, battle.pendingReport));
    assert.equal(tactical.completeTacticalSimulation(state), null);
    assert.equal(tactical.acknowledgeTacticalReport(state), null);
  }
  assert.equal(battle.phase, 'finished');
  const finalReport = battle.reports.at(-1);
  assert.ok(finalReport?.outcome);
  return {
    id: scenario.id,
    factionName: scenario.factionName,
    power: scenario.power,
    warned: scenario.warned,
    rearAssault: scenario.rearAssault,
    seed: scenario.seed,
    rounds,
    outcome: finalReport.outcome,
  };
}

const compiledDir = compileGameModules();
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);
const actual = SCENARIOS.map(scenario => runScenario(tactical, battleSimulation, scenario));

const fixtureDir = new URL('./fixtures/', import.meta.url);
const fixtureUrl = new URL('./fixtures/tactical_golden.json', import.meta.url);
const expected = JSON.parse(readFileSync(fixtureUrl, 'utf8'));
if (process.argv.includes('--update')) {
  mkdirSync(fixtureDir, { recursive: true });
  writeFileSync(fixtureUrl, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
  console.log('tactical golden fixture updated');
} else if (process.argv.includes('--verify-narrative-update')) {
  const withoutLines = scenarios => scenarios.map(scenario => ({
    ...scenario,
    rounds: scenario.rounds.map(({ lines: _lines, ...round }) => round),
  }));
  assert.deepEqual(withoutLines(actual), withoutLines(expected),
    'a narrative-only golden update must preserve every combat state and outcome field');
  let changedLines = 0;
  for (let scenarioIndex = 0; scenarioIndex < actual.length; scenarioIndex += 1) {
    for (let roundIndex = 0; roundIndex < actual[scenarioIndex].rounds.length; roundIndex += 1) {
      const actualLines = actual[scenarioIndex].rounds[roundIndex].lines;
      const expectedLines = expected[scenarioIndex].rounds[roundIndex].lines;
      assert.equal(actualLines.length, expectedLines.length);
      for (let lineIndex = 0; lineIndex < actualLines.length; lineIndex += 1) {
        if (actualLines[lineIndex] === expectedLines[lineIndex]) continue;
        changedLines += 1;
        assert.match(expectedLines[lineIndex], /이\(가\)|을\(를\)|\(으\)로/,
          'every changed golden line must previously contain a parenthesized particle');
        assert.doesNotMatch(actualLines[lineIndex], /이\(가\)|을\(를\)|\(으\)로/,
          'updated golden lines must resolve their Korean particles');
      }
    }
  }
  assert.ok(changedLines > 0, 'the narrative verification must observe at least one intended line change');
  console.log(`tactical golden narrative update verified (${changedLines} lines)`);
} else {
  assert.deepEqual(actual, expected);
  console.log('tactical golden tests passed');
}
