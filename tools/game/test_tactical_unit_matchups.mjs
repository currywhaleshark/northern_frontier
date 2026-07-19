import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-unit-matchups-'));
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

const compiledDir = compileGameModules();
const engagement = await import(pathToFileURL(join(compiledDir, 'tacticalEngagement.mjs')).href);
const units = await import(pathToFileURL(join(compiledDir, 'tacticalUnits.mjs')).href);
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);

const wall = {
  id: 'wall', name: '방책', kind: 'wall', order: 1,
  pressure: 12, breached: false, defenseBonus: 18, ambushBonus: 0,
  lootRisk: 0, civilianRisk: 0, description: 'matchup wall',
};

function defender(id, weapon, command = 'hold') {
  return {
    id, kind: weapon === 'spear' ? 'militia-spear' : weapon === 'musket' ? 'militia-musket' : 'militia-bow',
    label: id, role: 'militia', weapon, readyMuskets: weapon === 'musket' ? 14 : 0,
    residentIds: Array.from({ length: 18 }, (_unused, index) => index + 1), count: 18,
    zoneId: 'wall', command, power: 288, wounded: 0, killed: 0, line: 'front',
  };
}

function raider(id, unitType, overrides = {}) {
  return {
    id, kind: 'main', unitType, label: id, zoneId: 'wall', line: 'front', targetZoneId: 'wall',
    power: 300, count: 20, killed: 0, morale: 100, intent: 'advance', revealed: true,
    engagementsInZone: 0, ...overrides,
  };
}

function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function measureMatchup(defenderFactory, attackerFactory) {
  const results = Array.from({ length: 200 }, (_unused, index) => {
    const measuredDefender = defenderFactory();
    measuredDefender.residentIds = Array.from({ length: measuredDefender.count * 3 },
      (_entry, residentIndex) => residentIndex + 1);
    measuredDefender.count *= 3;
    measuredDefender.power *= 3;
    measuredDefender.readyMuskets *= 3;
    const measuredAttacker = attackerFactory();
    measuredAttacker.count *= 3;
    measuredAttacker.power *= 3;
    const exchange = engagement.resolveEngagementExchange({
      zone: { ...wall, pressure: 30 },
      defenders: [measuredDefender],
      attackers: [measuredAttacker],
      direction: 'frontal', weather: 'clear', prepareVolleyApplied: false,
      evacuateCiviliansApplied: false, roundStartingRaiderPower: measuredAttacker.power,
      rng: seededRng(2026071960 + index),
    });
    return {
      friendlyCasualties: exchange.defenderLosses.reduce(
        (sum, loss) => sum + loss.wounded + loss.killed, 0),
      enemyKilled: exchange.raiderLosses.reduce((sum, loss) => sum + loss.killed, 0),
    };
  });
  return {
    averageFriendlyCasualties: results.reduce((sum, result) => sum + result.friendlyCasualties, 0) / results.length,
    averageEnemyKilled: results.reduce((sum, result) => sum + result.enemyKilled, 0) / results.length,
  };
}

function casualtyReduction(recommended, wrong) {
  return wrong.averageFriendlyCasualties > 0
    ? (wrong.averageFriendlyCasualties - recommended.averageFriendlyCasualties) /
      wrong.averageFriendlyCasualties
    : 0;
}

for (const profile of units.tacticalUnitProfiles()) {
  assert.ok(profile.rangedMultiplier > 0 && profile.meleeMultiplier > 0 && profile.chargeMultiplier > 0);
  assert.ok(profile.protectionMultiplier > 0 && profile.mobility >= 1 && profile.routeSpeed >= 1);
  assert.ok(profile.wallPressure >= 0 && Array.isArray(profile.targetPriorities));
}
for (const phase2Id of ['shield-infantry', 'deserter-musketeer', 'wall-breaker', 'court-shield', 'court-horse-archer']) {
  assert.equal(units.tacticalUnitProfile(phase2Id).enabled, true, `${phase2Id} is active in phase 2`);
}

const lancer = raider('lancer', 'court-cavalry');
const lancerAgainstBow = engagement.tacticalAttackerMatchupMultiplier(
  lancer, [defender('bow', 'hornBow')], wall, 'frontal');
const lancerAgainstSpear = engagement.tacticalAttackerMatchupMultiplier(
  lancer, [defender('spear', 'spear')], wall, 'frontal');
assert.ok(lancerAgainstSpear < lancerAgainstBow,
  'a prepared spear wall reduces mounted shock power more than an archer line');
assert.ok(
  engagement.tacticalDefenderMatchupMultiplier(defender('spear', 'spear'), [lancer], 'frontal') > 1,
  'spear defenders gain a frontal anti-mounted power edge',
);
assert.ok(
  engagement.tacticalRaiderWeatherMultiplier(raider('gunner', 'deserter-musketeer'), 'blizzard') <
    engagement.tacticalRaiderWeatherMultiplier(raider('gunner', 'deserter-musketeer'), 'clear'),
  'blizzards suppress firearm units used by the missile-suppression doctrine',
);
assert.ok(
  engagement.tacticalRaiderWeatherMultiplier(raider('archer', 'nimacha-hunter'), 'heavySnow') < 1,
  'heavy snow suppresses enemy bow fire',
);

const shield = raider('shield', 'shield-infantry');
assert.ok(
  engagement.tacticalDefenderMatchupMultiplier(defender('bow', 'hornBow'), [shield], 'frontal') < 1,
  'shields screen arrow fire',
);
assert.ok(
  engagement.tacticalDefenderMatchupMultiplier(defender('musket', 'musket'), [shield], 'frontal') > 1,
  'firearms penetrate shielded advances',
);
assert.ok(
  engagement.tacticalRaiderLossMatchupMultiplier(shield, [defender('musket', 'musket')], 'frontal') >
    engagement.tacticalRaiderLossMatchupMultiplier(shield, [defender('bow', 'hornBow')], 'frontal'),
  'shield groups take a larger loss share from muskets than bows',
);

const spearWallResponse = measureMatchup(
  () => defender('spear-response', 'spear'),
  () => raider('lancer-response', 'court-cavalry'),
);
const bowLineAgainstLancers = measureMatchup(
  () => defender('bow-response', 'hornBow'),
  () => raider('lancer-response', 'court-cavalry'),
);
const spearWallReduction = casualtyReduction(spearWallResponse, bowLineAgainstLancers);
assert.ok(spearWallReduction >= 0.1 && spearWallReduction <= 0.3,
  `spear-wall response should reduce mounted-shock casualties by 10-30%, got ${spearWallReduction}`);

const musketResponse = measureMatchup(
  () => defender('musket-response', 'musket', 'volley'),
  () => raider('shield-response', 'shield-infantry'),
);
const bowAgainstShields = measureMatchup(
  () => defender('bow-response', 'hornBow', 'volley'),
  () => raider('shield-response', 'shield-infantry'),
);
const firearmReduction = casualtyReduction(musketResponse, bowAgainstShields);
assert.ok(firearmReduction >= 0.1 && firearmReduction <= 0.3,
  `firearm response should reduce shielded-advance casualties by 10-30%, got ${firearmReduction}`);
assert.ok(musketResponse.averageEnemyKilled > bowAgainstShields.averageEnemyKilled,
  'firearms also inflict more losses on a shielded advance than bows');

const breaker = raider('breaker', 'wall-breaker', { intent: 'breakWall' });
const melee = raider('melee', 'court-melee');
assert.ok(engagement.tacticalUnitWallPressure(breaker, 'breachAndStorm') >
  engagement.tacticalUnitWallPressure(melee, 'shockBreakthrough'));
assert.ok(engagement.tacticalUnitWallPressure(breaker, 'breachAndStorm', 0.4) <
  engagement.tacticalUnitWallPressure(breaker, 'breachAndStorm', 1),
  'preparation counters scale an actual wall-breaker group rather than a hidden generic bonus');

const consequenceInput = {
  zone: wall,
  defenders: [defender('spear', 'spear')],
  commands: ['hold'],
  enemyPower: 80,
  defensePower: 70,
  enemyShare: 80 / 150,
  originalPower: 150,
  availableLoot: {},
  rng: () => 0.5,
};
const breakerPressure = engagement.applyDefenseZoneConsequences({
  ...consequenceInput, attackers: [breaker], doctrine: 'breachAndStorm', wallBreakerEffectScale: 1,
});
const meleePressure = engagement.applyDefenseZoneConsequences({
  ...consequenceInput, attackers: [melee], doctrine: 'shockBreakthrough',
});
assert.ok(breakerPressure.pressure > meleePressure.pressure,
  'a real wall-breaker group creates more wall pressure than ordinary melee infantry');

const state = battleSimulation.createBattleSimulation({
  mode: 'garrison', factionName: '조정 토벌군', power: 154, warned: true, siege: true,
  season: 'winter', weather: 'clear', prepPoints: 0,
  defenders: { muskets: 3, bows: 3, spears: 4, unarmedMilitia: 1, watchmen: 2, hunters: 3, civilians: 6 },
  cannonEmplacements: 0, enemyDoctrine: 'shockBreakthrough',
  enemyCompositionTemplateId: 'court-cavalry-wing', enemyFlankRoute: 'none', seed: 2026071951,
});
const battle = state.tacticalBattle;
battle.enemyPlan.stratagems = [
  { id: 'wallBreakers', revealed: true, counterLevel: 0 },
  ...battle.enemyPlan.stratagems.filter(stratagem => stratagem.id !== 'wallBreakers'),
];
const powerBefore = battle.raiderGroups.reduce((sum, group) => sum + group.power, 0);
const countBefore = battle.raiderGroups.reduce((sum, group) => sum + group.count, 0);
assert.equal(tactical.advanceTacticalPhase(state), null);
const wallBreakerGroup = battle.raiderGroups.find(group => group.unitType === 'wall-breaker');
assert.ok(wallBreakerGroup, 'the wallBreakers stratagem materializes as a targetable group');
assert.equal(wallBreakerGroup.label, '파책 살수조');
assert.equal(battle.raiderGroups.reduce((sum, group) => sum + group.power, 0), powerBefore);
assert.equal(battle.raiderGroups.reduce((sum, group) => sum + group.count, 0), countBefore);

console.log('tactical unit matchup tests passed');
console.log(JSON.stringify({
  spearWall: { recommended: spearWallResponse, wrong: bowLineAgainstLancers, casualtyReduction: spearWallReduction },
  shieldedAdvance: { recommended: musketResponse, wrong: bowAgainstShields, casualtyReduction: firearmReduction },
}));
