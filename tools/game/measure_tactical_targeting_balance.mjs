import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-targeting-balance-'));
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

const FACTIONS = [
  { name: '니마차 우디캐', basePower: 68 },
  { name: '홀라온 야인', basePower: 76 },
  { name: '변경 마적', basePower: 80 },
  { name: '조정 토벌군', basePower: 132 },
];

const SCENARIOS = Array.from({ length: 20 }, (_unused, index) => {
  const faction = FACTIONS[index % FACTIONS.length];
  return {
    factionName: faction.name,
    power: faction.basePower + Math.floor(index / FACTIONS.length) * 3,
    warned: Math.floor(index / FACTIONS.length) % 2 === 1,
    seed: 2026071480 + index,
  };
});

const DEFENDERS = {
  muskets: 3,
  bows: 3,
  spears: 4,
  unarmedMilitia: 1,
  watchmen: 2,
  hunters: 3,
  civilians: 6,
};

function advanceToCommand(tactical, state) {
  const battle = state.tacticalBattle;
  for (let guard = 0; guard < 4 && battle.phase !== 'command'; guard += 1) {
    assert.equal(tactical.advanceTacticalPhase(state), null);
  }
  assert.equal(battle.phase, 'command');
}

function assignEveryReachableFocus(tactical, battle, state) {
  for (const group of battle.raiderGroups) group.revealed = true;
  for (const defender of battle.defenderGroups.filter(group =>
    group.commandable !== false && group.count - group.wounded - group.killed > 0)) {
    const target = battle.raiderGroups
      .filter(group => group.zoneId === defender.zoneId && group.intent !== 'withdraw' &&
        group.power > 0 && group.count - group.killed > 0)
      .reverse()
      .find(group => tactical.tacticalGroupTargetUnavailableReason(battle, defender.id, group.id) == null);
    if (target) assert.equal(tactical.setTacticalGroupTarget(state, defender.id, target.id), null);
  }
}

function runScenario(tactical, battleSimulation, scenario, targetingMode) {
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
    seed: scenario.seed,
  });
  const battle = state.tacticalBattle;
  assert.ok(battle);
  advanceToCommand(tactical, state);

  for (let guard = 0; guard < 10 && battle.phase === 'command'; guard += 1) {
    if (targetingMode === 'focus') assignEveryReachableFocus(tactical, battle, state);
    assert.equal(tactical.resolveTacticalRound(state), null);
    assert.equal(tactical.completeTacticalSimulation(state), null);
    assert.equal(tactical.acknowledgeTacticalReport(state), null);
  }
  assert.equal(battle.phase, 'finished');
  const friendlyCasualties = battle.defenderGroups.reduce(
    (sum, group) => sum + group.wounded + group.killed,
    0,
  );
  const enemyKills = battle.raiderGroups.reduce((sum, group) => sum + group.killed, 0);
  return {
    friendlyCasualties,
    enemyKills,
    totalCasualties: friendlyCasualties + enemyKills,
    enemyDistribution: battle.raiderGroups.map(group => group.killed),
    outcome: battle.reports.at(-1)?.outcome,
  };
}

function summarize(results) {
  const outcomes = {};
  for (const result of results) outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1;
  return {
    battles: results.length,
    averageFriendlyCasualties: results.reduce((sum, result) => sum + result.friendlyCasualties, 0) / results.length,
    averageEnemyKills: results.reduce((sum, result) => sum + result.enemyKills, 0) / results.length,
    averageTotalCasualties: results.reduce((sum, result) => sum + result.totalCasualties, 0) / results.length,
    outcomes,
  };
}

function relativeDelta(current, baseline) {
  return baseline === 0 ? (current === 0 ? 0 : Number.POSITIVE_INFINITY) : (current - baseline) / baseline;
}

function measureFixedBudget(tacticalEngagement) {
  const zone = {
    id: 'wall', name: 'target budget wall', kind: 'wall', order: 1,
    pressure: 30, breached: false, defenseBonus: 10, ambushBonus: 0,
    lootRisk: 0, civilianRisk: 10, description: 'target budget measurement',
  };
  const defender = (id, weapon, line, command, power) => ({
    id,
    kind: weapon === 'spear' ? 'militia-spear' : weapon === 'musket' ? 'militia-musket' : 'militia-bow',
    role: 'militia', weapon, readyMuskets: weapon === 'musket' ? 20 : 0,
    label: id, residentIds: Array.from({ length: 20 }, (_unused, index) => index + 1), count: 20,
    zoneId: zone.id, command, commandSource: 'player', power, wounded: 0, killed: 0, line,
  });
  const raider = (id, line, unitType) => ({
    id, kind: 'main', unitType, label: id, zoneId: zone.id, line,
    targetZoneId: zone.id, power: 120, count: 30, killed: 0, morale: 100,
    intent: 'advance', revealed: true, engagementsInZone: 0,
  });
  const defenders = [
    defender('front-spear', 'spear', 'front', 'hold', 80),
    defender('middle-musket', 'musket', 'middle', 'volley', 160),
    defender('rear-bow', 'hornBow', 'rear', 'volley', 120),
  ];
  const attackers = [
    raider('front-main', 'front', 'bandit-vanguard'),
    raider('middle-rider', 'middle', 'bandit-rider'),
    raider('rear-command', 'rear', 'court-artillery'),
  ];
  const input = {
    zone, defenders, attackers, direction: 'frontal', weather: 'clear',
    prepareVolleyApplied: false, evacuateCiviliansApplied: false,
    roundStartingRaiderPower: attackers.reduce((sum, group) => sum + group.power, 0),
  };
  const automatic = tacticalEngagement.resolveEngagementExchange({ ...input, rng: () => 0.2 });
  const targeted = tacticalEngagement.resolveEngagementExchange({
    ...input,
    defenders: defenders.map((group, index) => ({
      ...group, targetGroupId: attackers[index].id, targetSource: 'player',
    })),
    rng: () => 0.2,
  });
  const killed = result => result.raiderLosses.reduce((sum, loss) => sum + loss.killed, 0);
  const powerLost = result => result.raiderLosses.reduce((sum, loss) => {
    const original = attackers.find(group => group.id === loss.groupId);
    return sum + original.power - loss.powerAfter;
  }, 0);
  return {
    automaticKilled: killed(automatic),
    targetedKilled: killed(targeted),
    killedDelta: killed(targeted) - killed(automatic),
    automaticPowerLoss: powerLost(automatic),
    targetedPowerLoss: powerLost(targeted),
    powerLossDelta: powerLost(targeted) - powerLost(automatic),
  };
}

const compiledDir = compileGameModules();
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const tacticalEngagement = await import(pathToFileURL(join(compiledDir, 'tacticalEngagement.mjs')).href);
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);
const autoResults = SCENARIOS.map(scenario => runScenario(tactical, battleSimulation, scenario, 'auto'));
const focusResults = SCENARIOS.map(scenario => runScenario(tactical, battleSimulation, scenario, 'focus'));
const auto = summarize(autoResults);
const focus = summarize(focusResults);
const downstreamTotalCasualtyDelta = relativeDelta(focus.averageTotalCasualties, auto.averageTotalCasualties);
const fixedBudget = measureFixedBudget(tacticalEngagement);
const changedDistributions = autoResults.filter((result, index) =>
  result.enemyDistribution.some((killed, groupIndex) => killed !== focusResults[index].enemyDistribution[groupIndex])).length;

assert.equal(fixedBudget.killedDelta, 0, 'targeting must preserve the integer casualty budget exactly');
assert.ok(Math.abs(fixedBudget.powerLossDelta) < 1e-9,
  `targeting must preserve the continuous power-loss budget: ${fixedBudget.powerLossDelta}`);
assert.ok(Math.abs(downstreamTotalCasualtyDelta) <= 0.1,
  `focused targeting changed downstream average total casualties by more than 10%: ${downstreamTotalCasualtyDelta}`);
assert.ok(changedDistributions > 0, 'focused targeting should change who receives the fixed loss budget');

console.log(JSON.stringify({
  auto, focus, fixedBudget, downstreamTotalCasualtyDelta, changedDistributions,
}, null, 2));
