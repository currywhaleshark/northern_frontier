import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-enemy-plan-'));
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
const enemyPlan = await import(pathToFileURL(join(compiledDir, 'enemyPlan.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const engagement = await import(pathToFileURL(join(compiledDir, 'tacticalEngagement.mjs')).href);

const neutral = enemyPlan.createEnemyPlan({
  factionName: '변경 마적', power: 140, relation: 50,
  objectiveRoll: 0.95, flankRoll: 0.2, stratagemRoll: 0.4, revealed: false,
});
assert.equal(neutral.objective, 'breakthrough', 'neutral legacy encounters retain the breakthrough objective');

const hostileInput = {
  factionName: '변경 마적', power: 140, relation: 5,
  objectiveRoll: 0.55, flankRoll: 0.2, stratagemRoll: 0.4, revealed: false,
};
assert.deepEqual(enemyPlan.createEnemyPlan(hostileInput), enemyPlan.createEnemyPlan(hostileInput),
  'the same locked inputs always produce the same plan');
const objectives = new Set(Array.from({ length: 100 }, (_unused, index) => enemyPlan.createEnemyPlan({
  ...hostileInput, objectiveRoll: index / 100,
}).objective));
assert.deepEqual([...objectives].sort(), ['arson', 'breakthrough', 'plunder'],
  'hostile objective rolls can deterministically select all three objectives');

const factionWeights = enemyPlan.enemyObjectiveWeights('변경 마적', 100, 10);
const courtWeights = enemyPlan.enemyObjectiveWeights('조정 토벌군', 100, 10);
const highPowerWeights = enemyPlan.enemyObjectiveWeights('변경 마적', 220, 10);
assert.notDeepEqual(factionWeights, courtWeights, 'faction identity changes objective preference');
assert.notDeepEqual(factionWeights, highPowerWeights, 'enemy power changes objective preference');

const lowBudget = enemyPlan.createEnemyPlan({
  factionName: '니마차 우디캐', power: 35, relation: 35,
  objectiveRoll: 0, flankRoll: 0.9, stratagemRoll: 0, revealed: false,
});
const highBudget = enemyPlan.createEnemyPlan({
  factionName: '조정 토벌군', power: 220, relation: 0,
  objectiveRoll: 0.9, flankRoll: 0.1, stratagemRoll: 0.7, revealed: true,
});
assert.ok(highBudget.stratagemPoints > lowBudget.stratagemPoints,
  'faction strength, enemy power, and hostility increase the stratagem budget');
for (const plan of [lowBudget, highBudget]) {
  assert.ok(plan.stratagems.length >= 1 && plan.stratagems.length <= 3,
    'each generated plan purchases between one and three stratagems');
  assert.equal(new Set(plan.stratagems.map(entry => entry.id)).size, plan.stratagems.length,
    'a plan never purchases the same stratagem twice');
  assert.ok(plan.stratagems.reduce((sum, entry) => sum + enemyPlan.enemyStratagemCost(entry.id), 0) <=
    plan.stratagemPoints, 'purchased stratagems stay within the locked point budget');
}

const breakthrough = enemyPlan.enemyObjectiveProfile('breakthrough');
const plunder = enemyPlan.enemyObjectiveProfile('plunder');
const arson = enemyPlan.enemyObjectiveProfile('arson');
for (const profile of [breakthrough, plunder, arson]) {
  assert.ok(Math.abs(profile.raiderSplit.main + profile.raiderSplit.looters + profile.raiderSplit.flankers - 1) < 1e-9);
}
assert.ok(plunder.raiderSplit.looters > breakthrough.raiderSplit.looters,
  'plunder shifts more of the force into looters');
assert.ok(arson.raiderSplit.flankers > breakthrough.raiderSplit.flankers,
  'arson shifts more of the force into delivery and flanking groups');
assert.ok(plunder.lootRoundsToExit < breakthrough.lootRoundsToExit,
  'plunderers withdraw after fewer successful loot rounds');
assert.ok(Number.isFinite(arson.damageToExit) && !Number.isFinite(breakthrough.damageToExit),
  'only the arson objective gains a finite building-damage goal');
assert.equal(tactical.tacticalEnemyObjectiveOutcome('breakthrough', 0, true, 0, 0), undefined);
assert.equal(tactical.tacticalEnemyObjectiveOutcome('plunder', 0, true, 0, 0), 'raidersLooted');
assert.equal(tactical.tacticalEnemyObjectiveOutcome('arson', 0, false, 1, 1), 'partialLoss');

assert.deepEqual(enemyPlan.migrateEnemyPlan({
  objective: 'plunder', objectiveRevealed: true, stratagemPoints: 7,
  stratagems: [
    { id: 'feint', revealed: true, counterLevel: 1 },
    { id: 'fireArrows', revealed: false, counterLevel: 0 },
    { id: 'nightApproach', revealed: false, counterLevel: 2 },
    { id: 'wallBreakers', revealed: true, counterLevel: 0 },
  ],
}), {
  objective: 'plunder', objectiveRevealed: true, stratagemPoints: 7,
  stratagems: [
    { id: 'feint', revealed: true, counterLevel: 1 },
    { id: 'fireArrows', revealed: false, counterLevel: 0 },
    { id: 'nightApproach', revealed: false, counterLevel: 2 },
  ],
}, 'migration preserves known objectives and stratagems while enforcing the three-stratagem cap');

const state = simulation.newGame(2026071499);
state.relations['변경 마적'] = 5;
const battle = tactical.createTacticalBattle(state, {
  factionName: '변경 마적', power: 140, warned: true, siege: true, mode: 'garrison',
});
assert.ok(state.log.some(log => log.text.startsWith('적의 계책 징후:')),
  'every locked plan emits at least one pre-battle warning sign');
const lockedPlan = structuredClone(battle.enemyPlan);
state.relations['변경 마적'] = 100;
assert.equal(tactical.advanceTacticalPhase(state), null);
assert.deepEqual(battle.enemyPlan, lockedPlan, 'deployment and preparation changes cannot rewrite the locked enemy plan');

const stratagemIds = ['rearManeuver', 'wallBreakers', 'fireArrows', 'feint', 'nightApproach'];
for (const id of stratagemIds) {
  const definition = enemyPlan.enemyStratagemDefinition(id);
  assert.equal(definition.id, id);
  assert.ok(definition.effect.length > 0, `${id} defines an effect`);
  assert.ok(definition.warning.length > 0, `${id} defines a warning sign`);
  assert.ok(definition.counter.length > 0, `${id} defines a counter`);
  assert.ok(definition.drawback.length > 0, `${id} defines an enemy drawback`);
}
assert.equal(enemyPlan.enemyStratagemEffectScale({ counterLevel: 0 }), 1);
assert.equal(enemyPlan.enemyStratagemEffectScale({ counterLevel: 1 }), 0.4);
assert.equal(enemyPlan.enemyStratagemEffectScale({ counterLevel: 2 }), 0);
assert.ok(enemyPlan.enemyPlanRangedEfficiency({
  objective: 'breakthrough', objectiveRevealed: false, stratagemPoints: 2,
  stratagems: [{ id: 'nightApproach', revealed: false, counterLevel: 0 }],
}) < 1, 'night approach reduces both sides ranged efficiency');

const counterState = simulation.newGame(2026071500);
const counterBattle = tactical.createTacticalBattle(counterState, {
  factionName: '변경 마적', power: 90, warned: true, siege: true, mode: 'garrison',
});
counterBattle.enemyPlan = {
  objective: 'arson', objectiveRevealed: true, stratagemPoints: 5,
  stratagems: [
    { id: 'fireArrows', revealed: true, counterLevel: 0 },
    { id: 'nightApproach', revealed: true, counterLevel: 0 },
  ],
};
counterBattle.prepPoints = 5;
assert.ok(counterBattle.prepActions.some(action => action.id === 'firePrevention'));
assert.ok(counterBattle.prepActions.some(action => action.id === 'torchWatch'));
assert.equal(tactical.spendPreparationAction(counterState, 'firePrevention'), null);
assert.equal(tactical.spendPreparationAction(counterState, 'torchWatch'), null);
assert.equal(tactical.advanceTacticalPhase(counterState), null);
assert.ok(counterBattle.enemyPlan.stratagems.every(stratagem => stratagem.counterLevel === 1),
  'selected preparation counters partially suppress matching stratagems without deleting them');
const irrelevantState = simulation.newGame(2026071504);
const irrelevantBattle = tactical.createTacticalBattle(irrelevantState, {
  factionName: '변경 마적', power: 70, warned: false, siege: true, mode: 'garrison',
});
irrelevantBattle.enemyPlan = {
  objective: 'breakthrough', objectiveRevealed: false, stratagemPoints: 0, stratagems: [],
};
assert.match(tactical.tacticalPreparationUnavailableReason(irrelevantState, 'firePrevention'), /징후/);
assert.match(tactical.tacticalPreparationUnavailableReason(irrelevantState, 'torchWatch'), /징후/);

function wallBreakerBattle(seed, countered) {
  const wallState = simulation.newGame(seed);
  const wallBattle = tactical.createTacticalBattle(wallState, {
    factionName: '변경 마적', power: 90, warned: false, siege: true, mode: 'garrison',
  });
  wallBattle.enemyPlan = {
    objective: 'breakthrough', objectiveRevealed: true, stratagemPoints: 2,
    stratagems: [{ id: 'wallBreakers', revealed: true, counterLevel: 0 }],
  };
  wallBattle.prepPoints = 5;
  if (countered) assert.equal(tactical.spendPreparationAction(wallState, 'repairWall'), null);
  assert.equal(tactical.advanceTacticalPhase(wallState), null);
  return wallBattle.raiderGroups.find(group => group.kind === 'main');
}
const fullBreakers = wallBreakerBattle(2026071502, false);
const counteredBreakers = wallBreakerBattle(2026071502, true);
assert.ok(fullBreakers.wallPressureBonus > counteredBreakers.wallPressureBonus,
  'wall repair attenuates the wall-breaker pressure bonus');
assert.ok(fullBreakers.lossResistance > counteredBreakers.lossResistance,
  'countered wall breakers lose most of their extra casualty vulnerability');

const consequenceInput = {
  zone: {
    id: 'wall', name: 'wall', kind: 'wall', order: 1, pressure: 0, breached: false,
    defenseBonus: 0, ambushBonus: 0, lootRisk: 0, civilianRisk: 10, description: 'test',
  },
  defenders: [],
  attackers: [{
    id: 'fire-archers', kind: 'flankers', unitType: 'bandit-rider', label: 'fire archers',
    zoneId: 'wall', line: 'middle', targetZoneId: 'wall', power: 80, count: 10, killed: 0,
    morale: 80, intent: 'flank', revealed: true, engagementsInZone: 0,
  }],
  commands: [], enemyPower: 80, defensePower: 20, enemyShare: 0.8, originalPower: 100,
  availableLoot: {}, rng: () => 0.2,
};
const fullFire = engagement.applyDefenseZoneConsequences({ ...consequenceInput, fireArrowEffectScale: 1 });
const counteredFire = engagement.applyDefenseZoneConsequences({ ...consequenceInput, fireArrowEffectScale: 0.4 });
assert.ok(fullFire.pressure > counteredFire.pressure, 'fire prevention attenuates fire-arrow pressure');
assert.ok(fullFire.buildingsDamaged > counteredFire.buildingsDamaged,
  'fire prevention lowers fire-arrow building damage chance');

const fullNight = {
  objective: 'breakthrough', objectiveRevealed: false, stratagemPoints: 2,
  stratagems: [{ id: 'nightApproach', revealed: false, counterLevel: 0 }],
};
const counteredNight = structuredClone(fullNight);
counteredNight.stratagems[0].counterLevel = 1;
assert.ok(enemyPlan.enemyPlanRangedEfficiency(counteredNight) > enemyPlan.enemyPlanRangedEfficiency(fullNight));
assert.ok(enemyPlan.enemyPlanFirstRoundMoraleBonus(counteredNight) <
  enemyPlan.enemyPlanFirstRoundMoraleBonus(fullNight));

const feintState = simulation.newGame(2026071501);
const feintBattle = tactical.createTacticalBattle(feintState, {
  factionName: '변경 마적', power: 100, warned: false, siege: true, mode: 'garrison',
});
feintBattle.enemyPlan = {
  objective: 'plunder', objectiveRevealed: false, stratagemPoints: 2,
  stratagems: [{ id: 'feint', revealed: false, counterLevel: 0 }],
};
assert.equal(tactical.advanceTacticalPhase(feintState), null);
const mainPowerBeforeFeint = feintBattle.raiderGroups.filter(group => group.kind === 'main')
  .reduce((sum, group) => sum + group.power, 0);
assert.equal(tactical.advanceTacticalPhase(feintState), null);
const mainPowerAfterFeint = feintBattle.raiderGroups.filter(group => group.kind === 'main')
  .reduce((sum, group) => sum + group.power, 0);
assert.ok(mainPowerAfterFeint < mainPowerBeforeFeint, 'an uncountered feint transfers real power out of the main force');
assert.ok(feintBattle.raiderGroups.some(group => group.estimatedPower !== undefined &&
  group.estimatedPower !== group.power), 'feint display power remains distinct from real power');

const intelInput = {
  factionName: '변경 마적', power: 160, relation: 0,
  objectiveRoll: 0.7, flankRoll: 0.2, stratagemRoll: 0.4, intelRoll: 0.3, revealed: false,
};
const intelPlans = Array.from({ length: 5 }, (_unused, intelLevel) => enemyPlan.createEnemyPlan({
  ...intelInput, intelLevel,
}));
const revealedCount = plan => Number(plan.objectiveRevealed) +
  plan.stratagems.filter(stratagem => stratagem.revealed).length;
assert.equal(revealedCount(intelPlans[0]), 0);
assert.equal(revealedCount(intelPlans[1]), 0, 'intel level 1 exposes warning signs but no exact plan IDs');
assert.equal(revealedCount(intelPlans[2]), 1, 'intel level 2 identifies the objective or one stratagem');
assert.ok(revealedCount(intelPlans[3]) >= 2, 'intel level 3 reveals most of the plan');
assert.ok(intelPlans[4].objectiveRevealed && intelPlans[4].stratagems.every(stratagem => stratagem.revealed));
assert.equal(intelPlans[4].stratagems.filter(stratagem => stratagem.counterLevel === 2).length, 1,
  'intel level 4 fully counters exactly one first activation');
assert.equal(enemyPlan.enemyIntelLevel({ watchtowers: 0, watchmen: 0, hunters: 0 }), 0);
assert.equal(enemyPlan.enemyIntelLevel({ watchtowers: 1, watchmen: 2, hunters: 2 }), 4);
const unwarnedState = simulation.newGame(2026071505);
const warnedState = simulation.newGame(2026071505);
unwarnedState.relations['변경 마적'] = 0;
warnedState.relations['변경 마적'] = 0;
const unwarnedBattle = tactical.createTacticalBattle(unwarnedState, {
  factionName: '변경 마적', power: 110, warned: false, siege: true, mode: 'garrison',
});
const warnedBattle = tactical.createTacticalBattle(warnedState, {
  factionName: '변경 마적', power: 110, warned: true, siege: true, mode: 'garrison',
});
assert.deepEqual(warnedBattle.enemyPlan, unwarnedBattle.enemyPlan,
  'early warning no longer leaks exact enemy plan information');
assert.ok(warnedBattle.prepPoints > unwarnedBattle.prepPoints,
  'early warning still increases preparation points independently of plan intel');

console.log('enemy plan tests passed');
