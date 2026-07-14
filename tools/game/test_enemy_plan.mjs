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
  factionName: '니마차 우디캐', power: 35, relation: 45,
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
const lockedPlan = structuredClone(battle.enemyPlan);
state.relations['변경 마적'] = 100;
assert.equal(tactical.advanceTacticalPhase(state), null);
assert.deepEqual(battle.enemyPlan, lockedPlan, 'deployment and preparation changes cannot rewrite the locked enemy plan');

console.log('enemy plan tests passed');
