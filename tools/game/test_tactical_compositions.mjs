import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-compositions-'));
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
const units = await import(pathToFileURL(join(compiledDir, 'tacticalUnits.mjs')).href);
const compositions = await import(pathToFileURL(join(compiledDir, 'tacticalCompositions.mjs')).href);
const enemyPlan = await import(pathToFileURL(join(compiledDir, 'enemyPlan.mjs')).href);
const events = await import(pathToFileURL(join(compiledDir, 'tacticalEvents.mjs')).href);
const targeting = await import(pathToFileURL(join(compiledDir, 'tacticalTargeting.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);
const tacticalBattle = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);

const profiles = units.tacticalUnitProfiles();
assert.equal(profiles.length, 21, 'all 14 legacy and 7 new tactical unit profile IDs have one definition');
assert.equal(new Set(profiles.map(profile => profile.id)).size, profiles.length, 'profile IDs are unique');
for (const profile of profiles) {
  assert.ok(profile.label.length > 0 && profile.intelCategory.length > 0, `${profile.id} has canonical labels`);
  assert.ok(profile.tags.length > 0 && profile.factions.length > 0, `${profile.id} has tags and factions`);
  assert.equal(targeting.defaultRaiderFormationLine(profile.id), profile.defaultLine,
    `${profile.id} targeting uses the profile's default line`);
}

assert.deepEqual(units.tacticalUnitProfile('shield-infantry').factions, ['nimacha', 'bandit']);
assert.deepEqual(units.tacticalUnitProfile('deserter-musketeer').factions, ['bandit'],
  'deserter musketeers remain bandit-only');
assert.equal(units.tacticalUnitProfile('court-artillery').label, '불랑기 화포');
assert.equal(units.tacticalUnitProfile('court-cavalry').label, '기창 기병');
for (const deferredId of ['court-mortar', 'court-mounted-flail', 'scout', 'banner-crew']) {
  assert.equal(profiles.some(profile => profile.id === deferredId), false, `${deferredId} remains outside the MVP type set`);
}
assert.deepEqual(
  profiles.filter(profile => profile.implementationPhase === 2 && profile.enabled).map(profile => profile.id),
  ['shield-infantry', 'deserter-musketeer', 'wall-breaker', 'court-shield', 'court-horse-archer'],
  'phase 2 activates exactly the agreed matchup profiles',
);

const templates = compositions.tacticalCompositionTemplates();
assert.equal(new Set(templates.map(template => template.id)).size, templates.length, 'composition IDs are unique');
for (const faction of ['nimacha', 'holaon', 'bandit', 'court']) {
  assert.ok(templates.filter(template => template.faction === faction && template.implementationPhase === 1).length >= 4,
    `${faction} exposes at least four phase-1 composition contracts`);
}
for (const template of templates) {
  assert.ok(template.slots.length >= 3 && template.slots.length <= 6, `${template.id} has 3-6 groups`);
  for (const candidate of template.slots.flatMap(entry => entry.candidates)) {
    const profile = units.tacticalUnitProfile(candidate.unitType);
    assert.ok(profile.factions.includes(template.faction), `${candidate.unitType} is legal for ${template.faction}`);
    assert.ok(profile.implementationPhase <= template.implementationPhase,
      `${template.id} does not activate ${candidate.unitType} before its implementation phase`);
    if (template.faction === 'holaon') {
      assert.ok(profile.tags.includes('mounted'), 'Holaon composition contracts remain purely mounted');
      assert.equal(profile.tags.includes('firearm'), false, 'Holaon never receives firearm troops');
      assert.equal(profile.tags.includes('siege'), false, 'Holaon never receives wall-breaker troops');
    }
    if ((template.faction === 'nimacha' || template.faction === 'holaon') && profile.tags.includes('firearm')) {
      assert.fail(`northern base faction ${template.faction} cannot receive firearm profile ${profile.id}`);
    }
  }
}

const deterministicInput = {
  faction: 'holaon', doctrine: 'mountedSkirmish', objective: 'plunder', power: 140, roll: 0.61, maximumPhase: 2,
};
assert.deepEqual(
  compositions.chooseTacticalCompositionTemplate(deterministicInput),
  compositions.chooseTacticalCompositionTemplate(deterministicInput),
  'same locked inputs choose the same composition template',
);
assert.equal(
  compositions.chooseTacticalCompositionTemplate({ ...deterministicInput, forcedTemplateId: 'holaon-mounted-skirmish' }).id,
  'holaon-mounted-skirmish',
  'a valid simulator override can force an eligible template',
);
assert.equal(
  compositions.chooseTacticalCompositionTemplate({ ...deterministicInput, forcedTemplateId: 'bandit-hit-and-run' }),
  undefined,
  'an invalid cross-faction simulator override is rejected',
);
const phase2State = simulation.newGame(2026072055);
phase2State.relations['조정 토벌군'] = 0;
const phase2Battle = tacticalBattle.createTacticalBattle(phase2State, {
  factionName: '조정 토벌군', power: 160, warned: true, siege: true, mode: 'garrison',
  forcedDoctrine: 'shieldedAdvance', forcedCompositionTemplateId: 'court-shielded-advance',
  maximumCompositionPhase: 2,
});
assert.equal(phase2Battle.enemyPlan?.compositionTemplateId, 'court-shielded-advance');
assert.ok(phase2Battle.raiderGroups.some(group => group.unitType === 'court-shield'));
const compositionOnlyOverride = enemyPlan.createEnemyPlan({
  factionName: '조정 토벌군', power: 160, relation: 0, revealed: false,
  flankRoll: 0.1, objectiveRoll: 0.2, stratagemRoll: 0.3,
  forcedCompositionTemplateId: 'court-siege-battery',
});
assert.equal(compositionOnlyOverride.compositionTemplateId, 'court-siege-battery');
assert.ok(['shockBreakthrough', 'missileSuppression'].includes(compositionOnlyOverride.doctrine),
  'forcing only a simulator composition derives one compatible doctrine');
const forcedLeftRoute = enemyPlan.createEnemyPlan({
  factionName: '홀라온 야인', power: 100, relation: 0, revealed: false,
  flankRoll: 0.99, objectiveRoll: 0.2, stratagemRoll: 0.3,
  forcedFlankRoute: 'left',
});
assert.equal(forcedLeftRoute.flankRouteSide, 'left');
assert.ok(forcedLeftRoute.stratagems.some(entry => entry.id === 'rearManeuver'),
  'forcing a simulator flank route also locks the rear maneuver needed to use it');
const forcedNoRoute = enemyPlan.createEnemyPlan({
  factionName: '홀라온 야인', power: 100, relation: 0, revealed: false,
  flankRoll: 0, objectiveRoll: 0.2, stratagemRoll: 0.3,
  forcedFlankRoute: 'none',
});
assert.equal(forcedNoRoute.flankRouteSide, undefined);
assert.equal(forcedNoRoute.stratagems.some(entry => entry.id === 'rearManeuver'), false);

const forcedWallBreakers = enemyPlan.createEnemyPlan({
  factionName: '조정 토벌군', power: 160, relation: 100, revealed: true,
  flankRoll: 0.99, objectiveRoll: 0.2, stratagemRoll: 0.99,
  forcedCompositionTemplateId: 'court-legacy-punitive-force',
  forcedStratagem: 'wallBreakers',
  maximumCompositionPhase: 8,
});
assert.ok(forcedWallBreakers.stratagems.some(entry => entry.id === 'wallBreakers'),
  'the simulator can force one enemy stratagem into the generated plan');
const forcedNoStratagem = enemyPlan.createEnemyPlan({
  factionName: '조정 토벌군', power: 160, relation: 0, revealed: true,
  flankRoll: 0, objectiveRoll: 0.2, stratagemRoll: 0,
  forcedStratagem: 'none',
  maximumCompositionPhase: 8,
});
assert.deepEqual(forcedNoStratagem.stratagems, [],
  'the simulator can explicitly suppress every enemy stratagem');

const crowdedSimulation = battleSimulation.createBattleSimulation({
  scenario: 'defense', mode: 'garrison', factionName: '조정 토벌군', power: 160,
  warned: true, siege: true, season: 'winter', weather: 'clear', prepPoints: 0,
  defenders: { muskets: 1, bows: 2, spears: 1, unarmedMilitia: 1, watchmen: 1, hunters: 1, civilians: 4 },
  cannonEmplacements: 0, includeCombatSpecialResidents: true,
  enemyDoctrine: 'missileSuppression',
  enemyCompositionTemplateId: 'court-legacy-punitive-force',
  enemyStratagem: 'wallBreakers', enemyFlankRoute: 'auto', seed: 20260720,
});
assert.deepEqual(
  crowdedSimulation.residents.filter(resident => resident.special).map(resident => resident.special).sort(),
  ['hangwae', 'jurchenWarrior', 'tigerHunter', 'uinyeo'].sort(),
  'the crowd-QA preset includes exactly the four combat-visible special residents',
);

const configuredAllies = battleSimulation.createBattleSimulation({
  scenario: 'defense', mode: 'garrison', factionName: '니마차 우디캐', power: 70,
  warned: true, siege: false, season: 'autumn', weather: 'clear', prepPoints: 0,
  defenders: {
    muskets: 0, bows: 0, spears: 2, unarmedMilitia: 1,
    watchmen: 0, hunters: 2, physicians: 2, civilians: 0,
  },
  mountedDefenders: { spears: 1, hunters: 1 },
  combatSpecialResidents: ['jurchenWarrior', 'uinyeo'],
  mountedSpecialResidents: ['jurchenWarrior', 'uinyeo'],
  cannonEmplacements: 0, seed: 20260722,
});
assert.deepEqual(
  configuredAllies.residents.filter(resident => resident.special).map(resident => resident.special).sort(),
  ['jurchenWarrior', 'uinyeo'].sort(),
  'designated allied composition includes only the selected special residents',
);
assert.equal(
  configuredAllies.residents.filter(resident => resident.job === 'physician').length,
  3,
  'ordinary physicians and the selected royal physician both join as healers',
);
assert.equal(
  configuredAllies.tacticalBattle.defenderGroups
    .filter(group => group.kind === 'healer')
    .reduce((sum, group) => sum + group.count, 0),
  3,
  'physicians materialize as a rear healer group in the tactical battle',
);
const configuredMountedIds = Object.keys(configuredAllies.mountAssignments).map(Number);
assert.equal(configuredMountedIds.length, 3,
  'designated spear, hunter, and eligible special resident receive horses');
const uinyeoResident = configuredAllies.residents.find(resident => resident.special === 'uinyeo');
assert.ok(uinyeoResident && !configuredMountedIds.includes(uinyeoResident.id),
  'the physician remains unmounted even if an invalid mounted-special option reaches the backend');
assert.equal(
  configuredAllies.tacticalBattle.defenderGroups
    .filter(group => group.mount === 'horse')
    .reduce((sum, group) => sum + group.count, 0),
  3,
  'mounted assignments remain visible in the generated tactical groups',
);

const randomizedAllies = Array.from({ length: 12 }, (_, index) =>
  battleSimulation.createBattleSimulation({
    scenario: 'defense', mode: 'garrison', factionName: '니마차 우디캐', power: 60,
    warned: true, siege: false, season: 'summer', weather: 'clear', prepPoints: 0,
    defenders: 'random', combatSpecialResidents: 'random',
    mountedDefenders: 'random', mountedSpecialResidents: 'random',
    cannonEmplacements: 0, seed: 20260800 + index,
  }));
assert.ok(randomizedAllies.some(simulation =>
  simulation.residents.some(resident => resident.job === 'physician' && resident.special !== 'uinyeo')),
  'random allied composition can generate ordinary physicians');
assert.ok(randomizedAllies.some(simulation => simulation.residents.some(resident => resident.special)),
  'random allied composition can generate combat special residents');
assert.ok(randomizedAllies.some(simulation => Object.keys(simulation.mountAssignments).length > 0),
  'random allied composition can generate mounted defenders');
assert.equal(crowdedSimulation.tacticalBattle.raiderGroups.length, 5,
  'the legacy court composition starts with five targetable enemy groups');
assert.equal(tacticalBattle.advanceTacticalPhase(crowdedSimulation), null);
assert.equal(crowdedSimulation.tacticalBattle.phase, 'deployment');
for (const special of ['jurchenWarrior', 'tigerHunter', 'hangwae']) {
  const group = crowdedSimulation.tacticalBattle.defenderGroups.find(candidate =>
    candidate.featuredResidents?.some(featured => featured.special === special));
  const featured = group?.featuredResidents?.find(candidate => candidate.special === special);
  assert.ok(group && featured, `${special} is attached to a deployment group`);
  assert.equal(tacticalBattle.splitFeaturedTacticalGroup(crowdedSimulation, group.id, featured.residentId), null);
}
const splitCandidate = crowdedSimulation.tacticalBattle.defenderGroups.find(group =>
  group.commandable !== false && group.count >= 2 && !(group.featuredResidents?.length));
assert.ok(splitCandidate, 'the crowd-QA roster leaves one regular group available for the tenth detachment');
assert.equal(tacticalBattle.splitTacticalGroup(crowdedSimulation, splitCandidate.id, 1), null);
assert.equal(
  crowdedSimulation.tacticalBattle.defenderGroups.filter(group => group.commandable !== false).length,
  10,
  'the special-resident preset can reach the ten-commandable-group cap during deployment',
);
tacticalBattle.applyAutoDeployTacticalGroups(crowdedSimulation.tacticalBattle);
assert.equal(tacticalBattle.advanceTacticalPhase(crowdedSimulation), null);
assert.equal(crowdedSimulation.tacticalBattle.raiderGroups.length, 6,
  'forced wall breakers materialize the sixth targetable enemy group at deployment');
assert.equal(
  crowdedSimulation.tacticalBattle.defenderGroups.filter(group => group.commandable !== false).length +
    crowdedSimulation.tacticalBattle.raiderGroups.length,
  16,
  'the simulator reproduces the 10-friendly plus 6-enemy overlap QA contract',
);

const doctrineDefinitions = enemyPlan.enemyDoctrineDefinitions();
assert.equal(doctrineDefinitions.length, 8, 'all persisted doctrine IDs have definitions');
for (const definition of doctrineDefinitions) {
  assert.ok(definition.label && definition.strength && definition.weakness && definition.counter,
    `${definition.id} shares label, strength, weakness, and counter copy with the UI`);
}
assert.equal(enemyPlan.enemyDoctrineDefinition('fireSupport').enabled, true, 'phase 8 activates fire support');
assert.equal(enemyPlan.enemyDoctrineDefinition('feignedRetreat').enabled, false, 'feigned retreat remains deferred');
assert.equal(new Set(doctrineDefinitions.filter(entry => entry.enabled).map(entry => entry.id)).size, 7,
  'phase 8 activates fire support while feigned retreat remains deferred');

for (const factionName of ['니마차 우디캐', '홀라온 야인', '변경 마적', '조정 토벌군']) {
  const counts = new Map();
  for (let index = 0; index < 200; index += 1) {
    const plan = enemyPlan.createEnemyPlan({
      factionName, power: 120, relation: 0, revealed: false,
      flankRoll: (index * 0.173) % 1,
      objectiveRoll: (index * 0.347) % 1,
      stratagemRoll: (index * 0.523) % 1,
      doctrineRoll: (index * 0.619) % 1,
      compositionRoll: (index * 0.757) % 1,
      maximumCompositionPhase: 8,
    });
    assert.ok(plan.doctrine && plan.compositionTemplateId, `${factionName} locks doctrine and composition metadata`);
    const template = compositions.tacticalCompositionTemplate(plan.compositionTemplateId);
    assert.ok(template.doctrines.includes(plan.doctrine), `${factionName} locks a composition-compatible doctrine`);
    assert.ok(template.objectives.includes(plan.objective), `${factionName} locks an objective-compatible composition`);
    if (plan.stratagems.some(entry => entry.id === 'rearManeuver')) {
      assert.ok(template.slots.some(entry => entry.role === 'flankers'),
        `${factionName} never buys rear maneuver for a composition without a flanking group`);
      assert.ok(plan.flankRouteSide === 'left' || plan.flankRouteSide === 'right');
    } else {
      assert.equal(plan.flankRouteSide, undefined);
    }
    counts.set(plan.compositionTemplateId, (counts.get(plan.compositionTemplateId) ?? 0) + 1);
  }
  assert.ok(counts.size >= 4, `${factionName} produces at least four composition IDs across 200 fixed inputs`);
  assert.ok(Math.max(...counts.values()) / 200 <= 0.45,
    `${factionName}'s most common composition stays at or below the 45% diversity gate`);
  for (let index = 0; index < 10; index += 1) {
    const state = simulation.newGame(2026072000 + index);
    state.relations[factionName] = 0;
    const battle = tacticalBattle.createTacticalBattle(state, {
      factionName, power: factionName === '조정 토벌군' ? 160 : 90,
      warned: true, siege: true, mode: 'garrison',
    });
    assert.equal(battle.raiderGroups.reduce((sum, group) => sum + group.power, 0), battle.originalPower,
      `${factionName} composition allocation preserves the locked power budget exactly`);
    assert.ok(battle.raiderGroups.length >= 3 && battle.raiderGroups.length <= 6);
  }
}

assert.deepEqual(enemyPlan.migrateEnemyPlan({
  objective: 'breakthrough', objectiveRevealed: true,
  doctrine: 'mountedSkirmish', doctrineRevealed: true,
  compositionTemplateId: 'holaon-mounted-skirmish', compositionRevealed: true,
  stratagemPoints: 2, stratagems: [],
}), {
  objective: 'breakthrough', objectiveRevealed: true, stratagemPoints: 2,
  doctrine: 'mountedSkirmish', doctrineRevealed: true,
  compositionTemplateId: 'holaon-mounted-skirmish', compositionRevealed: true,
  stratagems: [],
}, 'migration preserves known doctrine, composition, and their stored reveal truth');
const migratedUnknownMetadata = enemyPlan.migrateEnemyPlan({
  objective: 'breakthrough', objectiveRevealed: false,
  doctrine: 'futureDoctrine', doctrineRevealed: true,
  compositionTemplateId: 'future-template', compositionRevealed: true,
  stratagemPoints: 0, stratagems: [],
});
assert.equal(migratedUnknownMetadata.doctrine, undefined);
assert.equal(migratedUnknownMetadata.compositionTemplateId, undefined);
assert.equal(enemyPlan.migrateEnemyPlan({
  objective: 'breakthrough', objectiveRevealed: false, stratagemPoints: 2,
  flankRouteSide: 'right',
  stratagems: [{ id: 'rearManeuver', revealed: false, counterLevel: 0 }],
}).flankRouteSide, 'right', 'a locked flank side survives migration when rear maneuver exists');
assert.equal(enemyPlan.migrateEnemyPlan({
  objective: 'breakthrough', objectiveRevealed: false, stratagemPoints: 0,
  flankRouteSide: 'right', stratagems: [],
}).flankRouteSide, undefined, 'an orphaned flank side is discarded without rear maneuver');

const intelBattle = {
  enemyPlan: {
    objective: 'breakthrough', objectiveRevealed: true,
    doctrine: 'shockBreakthrough', doctrineRevealed: true,
    compositionTemplateId: 'holaon-shock-column', compositionRevealed: true,
    stratagemPoints: 3,
    stratagems: [{ id: 'rearManeuver', revealed: false, counterLevel: 0 }],
  },
  raiderGroups: [
    { id: 'lancers', unitType: 'holaon-lancer', label: '기마 선봉', count: 8, killed: 2, revealed: true },
    { id: 'archers', unitType: 'holaon-horse-archer', label: '기마 궁수', count: 5, killed: 0, revealed: false },
  ],
};
const summary = enemyPlan.enemyPlanSummaryView(intelBattle);
assert.deepEqual(summary.objective, { revealed: true, id: 'breakthrough', label: '방어선 돌파' });
assert.equal(summary.doctrine.label, '충격 돌파');
assert.equal(summary.doctrine.counter, enemyPlan.enemyDoctrineDefinition('shockBreakthrough').counter);
assert.equal(summary.composition.templateLabel, '홀라온 충격 돌파대');
assert.deepEqual(summary.composition.groups.map(group => ({
  label: group.label, exact: group.exact, count: group.count, unitType: group.unitType,
})), [
  { label: '기마 선봉', exact: true, count: 6, unitType: 'holaon-lancer' },
  { label: '궁기병', exact: false, count: undefined, unitType: undefined },
]);
assert.equal(summary.hiddenStratagemCount, 1);
assert.equal(summary.intentSignals.doctrineId, 'shockBreakthrough');
assert.deepEqual(summary.intentSignals.groups.map(group => group.groupId), ['lancers']);
assert.ok(summary.intentSignals.groups[0].signal.length > 0,
  'the backend selector owns visible per-group action signal copy');

const hiddenSummary = enemyPlan.enemyPlanSummaryView({
  ...intelBattle,
  enemyPlan: {
    ...intelBattle.enemyPlan,
    objectiveRevealed: false, doctrineRevealed: false, compositionRevealed: false,
  },
});
assert.equal(hiddenSummary.objective.label, '미확인');
assert.equal(hiddenSummary.doctrine.label, '미확인');
assert.equal(hiddenSummary.composition.templateLabel, '미확인 편제');
assert.equal(hiddenSummary.intentSignals.doctrineLabel, '미확인 교리');
assert.deepEqual(hiddenSummary.composition.groups.map(group => group.label), ['창기병'],
  'without composition intel only already sighted groups appear, and only by category');

assert.equal(events.isKnownTacticalAnimationEventKind('rearAssault'), true);
assert.equal(events.isKnownTacticalAnimationEventKind('doctrineShift'), true);
assert.equal(events.isKnownTacticalAnimationEventKind('futureRouteArrival'), false,
  'frontends can safely skip an unknown future animation event kind');

console.log('tactical composition contract tests passed');
