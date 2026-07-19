import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-contract-fixture-'));
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

const baseGroups = [
  { id: 'fixture-lancers', unitType: 'holaon-lancer', label: '기마 선봉', count: 8, killed: 2, revealed: true },
  { id: 'fixture-archers', unitType: 'holaon-horse-archer', label: '기마 궁수', count: 5, killed: 0, revealed: false },
  { id: 'fixture-raiders', unitType: 'holaon-raider', label: '약탈 기병', count: 4, killed: 0, revealed: false },
];
const plan = {
  objective: 'breakthrough', objectiveRevealed: true,
  doctrine: 'mountedSkirmish', doctrineRevealed: true,
  compositionTemplateId: 'holaon-mounted-skirmish', compositionRevealed: true,
  flankRouteSide: 'right', stratagemPoints: 4,
  stratagems: [
    { id: 'rearManeuver', revealed: true, counterLevel: 0 },
    { id: 'feint', revealed: false, counterLevel: 0 },
  ],
};
const fixture = {
  version: 1,
  profiles: units.tacticalUnitProfiles(),
  doctrines: enemyPlan.enemyDoctrineDefinitions(),
  templates: compositions.tacticalCompositionTemplates().map(template => ({
    id: template.id,
    label: template.label,
    faction: template.faction,
    doctrines: template.doctrines,
    objectives: template.objectives,
    implementationPhase: template.implementationPhase,
    slots: template.slots,
  })),
  views: {
    hidden: enemyPlan.enemyPlanSummaryView({
      enemyPlan: {
        ...plan,
        objectiveRevealed: false,
        doctrineRevealed: false,
        compositionRevealed: false,
        stratagems: plan.stratagems.map(entry => ({ ...entry, revealed: false })),
      },
      raiderGroups: baseGroups,
    }),
    revealed: enemyPlan.enemyPlanSummaryView({ enemyPlan: plan, raiderGroups: baseGroups }),
  },
  animationEventKinds: events.TACTICAL_ANIMATION_EVENT_KINDS,
  simulationOverrides: {
    enemyDoctrine: 'mountedSkirmish',
    enemyCompositionTemplateId: 'holaon-mounted-skirmish',
    enemyFlankRoute: 'right',
  },
};

const fixtureUrl = new URL('./fixtures/tactical_composition_contract.json', import.meta.url);
if (process.argv.includes('--update')) {
  writeFileSync(fixtureUrl, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  console.log('tactical composition contract fixture updated');
} else {
  const expected = JSON.parse(readFileSync(fixtureUrl, 'utf8'));
  assert.deepEqual(fixture, expected,
    'backend profile, doctrine, composition, selector, event, and simulator contracts must match the Fable fixture');
  console.log('tactical composition contract fixture tests passed');
}
