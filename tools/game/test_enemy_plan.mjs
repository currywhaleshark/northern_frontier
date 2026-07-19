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
assert.equal(enemyPlan.enemyCombinedCounterStrength({ preparation: 0.6, formation: 0.5 }), 0.8,
  'preparation and formation counters combine multiplicatively');
assert.equal(enemyPlan.enemyCombinedCounterStrength({ intelligence: 1, preparation: 0.6, formation: 0.5 }), 1,
  'a full intelligence counter remains exactly complete');
assert.ok(enemyPlan.enemyCombinedCounterStrength({ intelligence: 4, preparation: -2, formation: 3 }) <= 1,
  'combined counter strength is clamped to the 0-1 interval');
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
  objective: 'breakthrough', objectiveRevealed: false, stratagemPoints: 0, intelLevel: 0, stratagems: [],
};
irrelevantBattle.prepPoints = 2;
assert.equal(tactical.tacticalPreparationUnavailableReason(irrelevantState, 'firePrevention'), null,
  'fire prevention stays available when the enemy has no fire arrows');
assert.equal(tactical.tacticalPreparationUnavailableReason(irrelevantState, 'torchWatch'), null,
  'torch watch stays available when the enemy has no night approach');
assert.equal(tactical.spendPreparationAction(irrelevantState, 'firePrevention'), null);
assert.equal(tactical.spendPreparationAction(irrelevantState, 'torchWatch'), null);
assert.equal(irrelevantBattle.prepPoints, 0, 'unneeded counters still consume their normal preparation points');

const hiddenCounterPlan = {
  objective: 'arson', objectiveRevealed: false, stratagemPoints: 3, intelLevel: 1,
  stratagems: [{ id: 'fireArrows', revealed: false, counterLevel: 0 }],
};
assert.deepEqual(enemyPlan.enemyPlanCounterLabelsForAction(hiddenCounterPlan, 'firePrevention'), [],
  'a hidden fire-arrow plan never appears in the counter label');
hiddenCounterPlan.stratagems[0].revealed = true;
assert.deepEqual(enemyPlan.enemyPlanCounterLabelsForAction(hiddenCounterPlan, 'firePrevention'), ['불화살'],
  'a revealed fire-arrow plan appears in the counter label');

const noIntelPlan = {
  objective: 'arson', objectiveRevealed: false, stratagemPoints: 7, intelLevel: 0,
  stratagems: stratagemIds.map(id => ({ id, revealed: false, counterLevel: 0 })),
};
const noIntelWarnings = enemyPlan.enemyPlanWarningLines(noIntelPlan);
assert.deepEqual(noIntelWarnings, ['적의 접근 방식은 알 수 없습니다.'],
  'intel zero exposes no individual stratagem warning');

const physicalState = simulation.newGame(2026071506);
const physicalBattle = tactical.createTacticalBattle(physicalState, {
  factionName: '변경 마적', power: 70, warned: false, siege: true, mode: 'garrison',
});
physicalBattle.prepPoints = 8;
physicalState.resources.gunpowder = 0;
assert.match(tactical.tacticalPreparationUnavailableReason(physicalState, 'preliminaryBombardment'),
  /불랑기포대|화약/, 'physical building and powder requirements still disable impossible preparation');

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
  return {
    group: wallBattle.raiderGroups.find(group => group.unitType === 'wall-breaker'),
    effectScale: enemyPlan.enemyPlanStratagemScale(wallBattle.enemyPlan, 'wallBreakers'),
  };
}
const fullBreakers = wallBreakerBattle(2026071502, false);
const counteredBreakers = wallBreakerBattle(2026071502, true);
assert.ok(fullBreakers.group && counteredBreakers.group,
  'the wall-breaker stratagem materializes as an actual targetable group');
assert.ok(
  engagement.tacticalUnitWallPressure(
    fullBreakers.group, 'breachAndStorm', fullBreakers.effectScale,
  ) > engagement.tacticalUnitWallPressure(
    counteredBreakers.group, 'breachAndStorm', counteredBreakers.effectScale,
  ),
  'wall repair attenuates the actual wall-breaker group pressure',
);

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

function formationCounterBattle(seed, stratagemId, reservePower, divertedPower) {
  const formationState = simulation.newGame(seed);
  formationState.resources.spears = 3;
  formationState.residents.slice(0, 3).forEach(resident => {
    resident.job = 'militia';
    resident.sick = false;
    resident.health = 100;
  });
  const formationBattle = tactical.createTacticalBattle(formationState, {
    factionName: '변경 마적', power: 100, warned: true, siege: true, mode: 'garrison',
  });
  formationBattle.enemyPlan = {
    objective: 'plunder', objectiveRevealed: true, stratagemPoints: 4, intelLevel: 3,
    stratagems: [{ id: stratagemId, revealed: true, counterLevel: 0 }],
  };
  formationBattle.defenderGroups.forEach(group => { group.wounded = group.count; });
  const reserve = formationBattle.defenderGroups.find(group => group.weapon === 'spear') ??
    formationBattle.defenderGroups.find(group => group.commandable !== false);
  reserve.count = 1;
  reserve.wounded = 0;
  reserve.killed = 0;
  reserve.power = reservePower;
  reserve.line = stratagemId === 'rearManeuver' ? 'rear' : 'middle';
  reserve.command = 'hold';
  const diverted = formationBattle.raiderGroups.find(group => group.kind === 'flankers');
  diverted.power = divertedPower;
  diverted.count = Math.max(1, Math.round(divertedPower));
  diverted.killed = 0;
  diverted.morale = 100;
  diverted.combatMultiplier = 1;
  diverted.flankPlan = 'rearAssault';
  for (const group of formationBattle.raiderGroups.filter(group => group !== diverted)) {
    if (stratagemId === 'rearManeuver') group.power = 0;
    else if (group.kind === 'looters') group.power = divertedPower;
  }
  tactical.applyTacticalEnemyPlanDeployment(formationBattle);
  return { formationBattle, stratagem: formationBattle.enemyPlan.stratagems[0], diverted };
}

const counterFormation = result => result.stratagem.counter?.formation ?? 0;

const rearDefender = (id, zoneId, power, overrides = {}) => ({
  id, kind: 'militia-spear', role: 'militia', weapon: 'spear', label: id,
  residentIds: Array.from({ length: 10 }, (_unused, index) => `${id}-${index}`),
  zoneId, line: 'rear', command: 'hold', commandSource: 'player', power,
  count: 10, wounded: 0, killed: 0, ...overrides,
});
const rearAttacker = (id, zoneId, power, overrides = {}) => ({
  id, kind: 'flankers', unitType: 'bandit-rider', label: id, zoneId, targetZoneId: zoneId,
  line: 'rear', power, count: 10, killed: 0, morale: 100, intent: 'flank', revealed: true,
  engagementsInZone: 0, rearAssault: true, flankPlan: 'rearAssault', combatMultiplier: 1,
  ...overrides,
});
const rearBattle = (defenderGroups, raiderGroups, enemyPlanState = undefined) => ({
  defenderGroups, raiderGroups, enemyPlan: enemyPlanState,
  zones: [
    { id: 'wall', name: '목책' },
    { id: 'center', name: '중심지' },
    { id: 'storehouse', name: '창고' },
  ],
});
const rearCounter = (battle, zoneId, attackers, defenders) =>
  tactical.tacticalRearManeuverFormationCounterForEngagement(battle, zoneId, attackers, defenders);
const closeTo = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, received ${actual}`);

const wallGuard = rearDefender('wall-guard', 'wall', 80);
const centerGuard = rearDefender('center-guard', 'center', 60);
const wallFlanker = rearAttacker('wall-flanker', 'wall', 100);
const centerFlanker = rearAttacker('center-flanker', 'center', 30);
const multiZoneRearBattle = rearBattle([wallGuard, centerGuard], [wallFlanker, centerFlanker]);
closeTo(rearCounter(multiZoneRearBattle, 'wall', [wallFlanker], [wallGuard, centerGuard]), 80 / 180,
  'the wall counter uses only the wall rear guard and wall assault');
closeTo(rearCounter(multiZoneRearBattle, 'center', [centerFlanker], [wallGuard, centerGuard]), 60 / 90,
  'simultaneous rear engagements calculate an independent center counter');
centerGuard.power = 600;
closeTo(rearCounter(multiZoneRearBattle, 'wall', [wallFlanker], [wallGuard, centerGuard]), 80 / 180,
  'a center rear guard never raises the wall rear-maneuver counter');

for (const [guardPower, expected, description] of [
  [1, 1 / 101, 'one point of guard barely counters a 100-power maneuver'],
  [100, 0.5, 'equal rear forces produce a middle counter'],
  [400, 0.8, 'a four-to-one rear guard strongly counters the maneuver'],
]) {
  const guard = rearDefender(`ratio-guard-${guardPower}`, 'wall', guardPower);
  const attacker = rearAttacker(`ratio-attacker-${guardPower}`, 'wall', 100);
  const value = rearCounter(rearBattle([guard], [attacker]), 'wall', [attacker], [guard]);
  closeTo(value, expected, description);
  assert.ok(value >= 0 && value <= 1, 'rear formation counters stay in the 0-1 interval');
}

const firstGuard = rearDefender('first-guard', 'wall', 50);
const middleReserve = rearDefender('middle-reserve', 'wall', 100, { line: 'middle' });
const firstAssault = rearAttacker('first-assault', 'wall', 100, { engagementsInZone: 0 });
const firstAssaultBattle = rearBattle([firstGuard, middleReserve], [firstAssault]);
const firstCounter = rearCounter(firstAssaultBattle, 'wall', [firstAssault], [firstGuard, middleReserve]);
closeTo(firstCounter, 1 / 3, 'the first ambush includes a predeployed rear melee guard');
middleReserve.command = 'reinforceRear';
const reinforcedCounter = rearCounter(firstAssaultBattle, 'wall', [firstAssault], [firstGuard, middleReserve]);
closeTo(reinforcedCounter, 0.6, 'a middle melee reserve joins the next rear engagement after reinforceRear');
middleReserve.command = 'hold';
closeTo(rearCounter(firstAssaultBattle, 'wall', [firstAssault], [firstGuard, middleReserve]), firstCounter,
  'removing reinforceRear immediately removes the middle reserve from the counter');
firstAssaultBattle.enemyPlan = {
  objective: 'breakthrough', objectiveRevealed: true, stratagemPoints: 2,
  stratagems: [{
    id: 'rearManeuver', revealed: true, counterLevel: 1, counter: { preparation: 0.6 },
  }],
};
assert.equal(tactical.tacticalRearManeuverEffectiveCounterStrengthForZone(firstAssaultBattle, 'wall'), undefined,
  'the UI counter remains unavailable before the first rear-assault event has occurred');
firstAssault.engagementsInZone = 1;
closeTo(tactical.tacticalRearManeuverEffectiveCounterStrengthForZone(firstAssaultBattle, 'wall'),
  1 - (1 - 0.6) * (1 - firstCounter),
  'the UI counter combines fixed preparation with the currently engaged zone guard');
middleReserve.command = 'reinforceRear';
assert.ok(tactical.tacticalRearManeuverEffectiveCounterStrengthForZone(firstAssaultBattle, 'wall') >
  1 - (1 - 0.6) * (1 - firstCounter),
  'the UI counter rises after a live middle reserve receives reinforceRear');
middleReserve.command = 'hold';

const attritionGuard = rearDefender('attrition-guard', 'wall', 100);
const attritionAssault = rearAttacker('attrition-assault', 'wall', 100);
const attritionBattle = rearBattle([attritionGuard], [attritionAssault]);
const currentAttritionCounter = () => rearCounter(
  attritionBattle, 'wall', [attritionAssault], [attritionGuard],
);
closeTo(currentAttritionCounter(), 0.5, 'full surviving equal forces start at an equal counter');
attritionGuard.wounded = 5;
closeTo(currentAttritionCounter(), 1 / 3, 'wounded rear guards contribute only surviving power');
attritionGuard.wounded = 0;
attritionGuard.killed = 5;
closeTo(currentAttritionCounter(), 1 / 3, 'dead rear guards contribute only surviving power');
attritionGuard.killed = 0;
attritionGuard.zoneId = 'center';
assert.equal(currentAttritionCounter(), 0, 'a guard moved to another zone contributes nothing');
attritionGuard.zoneId = 'wall';
for (const command of ['redeploy', 'fallback', 'advance', 'openRetreat']) {
  attritionGuard.command = command;
  assert.equal(currentAttritionCounter(), 0, `${command} groups do not contribute rear guard power`);
}
attritionGuard.command = 'hold';
attritionGuard.commandable = false;
assert.equal(currentAttritionCounter(), 0, 'non-commandable civilians never contribute rear guard power');
attritionGuard.commandable = true;
attritionGuard.weapon = 'hornBow';
assert.equal(currentAttritionCounter(), 0, 'ranged-only groups never contribute rear guard power');
attritionGuard.weapon = 'spear';
attritionAssault.power = 50;
attritionAssault.killed = 5;
closeTo(currentAttritionCounter(), 2 / 3, 'losses to the rear assault raise the current formation counter');
attritionAssault.power = 100;
attritionAssault.killed = 0;
attritionAssault.morale = 50;
closeTo(currentAttritionCounter(), 2 / 3, 'lower rear-assault morale reduces current assault power');
attritionAssault.morale = 100;
attritionAssault.combatMultiplier = 0.5;
closeTo(currentAttritionCounter(), 2 / 3, 'the current rear-assault combat multiplier affects assault power');
const originalCombatMultiplier = attritionAssault.combatMultiplier;
closeTo(currentAttritionCounter(), currentAttritionCounter(), 'repeating the same engagement calculation is stable');
assert.equal(attritionAssault.combatMultiplier, originalCombatMultiplier,
  'formation-counter calculation never mutates the original attacker multiplier');
attritionAssault.confused = true;
assert.equal(currentAttritionCounter(), 1, 'confused rear attackers contribute no assault power');
attritionAssault.confused = false;
attritionAssault.intent = 'withdraw';
assert.equal(currentAttritionCounter(), 1, 'withdrawing rear attackers contribute no assault power');

const dynamicCounterStratagem = {
  counterLevel: 1,
  counter: { intelligence: 0, preparation: 0.6, formation: 0.99 },
};
closeTo(enemyPlan.enemyStratagemCounterStrengthForEngagement(dynamicCounterStratagem, 0.5), 0.8,
  'engagement counters combine fixed preparation with the current formation value');
closeTo(enemyPlan.enemyStratagemCounterStrengthForEngagement({
  counterLevel: 2, counter: { intelligence: 1, preparation: 0, formation: 0 },
}, 0), 1, 'a full intelligence counter remains complete in an engagement');
assert.ok(enemyPlan.enemyStratagemCounterStrengthForEngagement(dynamicCounterStratagem, 4) <= 1,
  'engagement counter strength remains clamped even with an invalid formation input');

const storedCounter = { preparation: 0.6, formation: 0.99 };
const deploymentRearPlan = {
  objective: 'breakthrough', objectiveRevealed: true, stratagemPoints: 2,
  stratagems: [{ id: 'rearManeuver', revealed: true, counterLevel: 1, counter: { ...storedCounter } }],
};
const deploymentGuard = rearDefender('deployment-guard', 'center', 500);
const deploymentAttacker = rearAttacker('deployment-attacker', 'wall', 100);
const deploymentRearBattle = rearBattle([deploymentGuard], [deploymentAttacker], deploymentRearPlan);
const deploymentPowerBefore = deploymentAttacker.power;
const deploymentMultiplierBefore = deploymentAttacker.combatMultiplier;
tactical.applyTacticalEnemyPlanDeployment(deploymentRearBattle);
assert.deepEqual(deploymentRearPlan.stratagems[0].counter, storedCounter,
  'deployment does not replace a rear maneuver with a global fixed formation truth');
tactical.applyTacticalEnemyPlanDeployment(deploymentRearBattle);
assert.equal(deploymentAttacker.power, deploymentPowerBefore,
  'reapplying deployment never reduces rear-assault power a second time');
assert.equal(deploymentAttacker.combatMultiplier, deploymentMultiplierBefore,
  'reapplying deployment never compounds a rear-assault combat penalty');

const weakFeintReserve = formationCounterBattle(2026071513, 'feint', 1, 100);
assert.ok(counterFormation(weakFeintReserve) < 0.02,
  'a tiny middle reserve cannot counter a large diverted feint force by a fixed fraction');

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
assert.equal(revealedCount(intelPlans[1]), 1, 'intel level 1 identifies the enemy objective');
assert.equal(intelPlans[1].compositionRevealed, false);
assert.equal(intelPlans[2].compositionRevealed, true, 'intel level 2 identifies the composition category');
assert.equal(intelPlans[2].doctrineRevealed, false);
assert.equal(intelPlans[3].doctrineRevealed, true, 'intel level 3 identifies the enemy doctrine');
assert.equal(intelPlans[3].stratagems.some(stratagem => stratagem.revealed), false);
assert.equal(revealedCount(intelPlans[4]), 2, 'intel level 4 identifies one exact stratagem in addition to the objective');
assert.equal(intelPlans[4].stratagems.filter(stratagem => stratagem.counterLevel === 2).length, 1,
  'intel level 4 fully counters exactly one revealed first activation');
for (let level = 1; level < intelPlans.length; level += 1) {
  assert.ok(Number(intelPlans[level].objectiveRevealed) >= Number(intelPlans[level - 1].objectiveRevealed));
  assert.ok(Number(intelPlans[level].compositionRevealed) >= Number(intelPlans[level - 1].compositionRevealed));
  assert.ok(Number(intelPlans[level].doctrineRevealed) >= Number(intelPlans[level - 1].doctrineRevealed));
}
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
