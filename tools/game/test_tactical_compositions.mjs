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

const doctrineDefinitions = enemyPlan.enemyDoctrineDefinitions();
assert.equal(doctrineDefinitions.length, 8, 'all persisted doctrine IDs have definitions');
for (const definition of doctrineDefinitions) {
  assert.ok(definition.label && definition.strength && definition.weakness && definition.counter,
    `${definition.id} shares label, strength, weakness, and counter copy with the UI`);
}
assert.equal(enemyPlan.enemyDoctrineDefinition('fireSupport').enabled, false, 'fire support waits for phase 8');
assert.equal(enemyPlan.enemyDoctrineDefinition('feignedRetreat').enabled, false, 'feigned retreat remains deferred');
assert.equal(new Set(doctrineDefinitions.filter(entry => entry.enabled).map(entry => entry.id)).size, 6,
  'the MVP activates exactly six doctrines');

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
assert.deepEqual(hiddenSummary.composition.groups.map(group => group.label), ['창기병'],
  'without composition intel only already sighted groups appear, and only by category');

assert.equal(events.isKnownTacticalAnimationEventKind('rearAssault'), true);
assert.equal(events.isKnownTacticalAnimationEventKind('futureRouteArrival'), false,
  'frontends can safely skip an unknown future animation event kind');

console.log('tactical composition contract tests passed');

