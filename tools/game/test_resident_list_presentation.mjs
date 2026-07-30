import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/ui/residentListPresentation.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const outputDir = mkdtempSync(join(tmpdir(), 'northern-resident-list-'));
const outputPath = join(outputDir, 'residentListPresentation.mjs');
writeFileSync(outputPath, output, 'utf8');
const { filteredResidents } = await import(pathToFileURL(outputPath).href);

const state = {
  day: 20,
  residents: [
    { id: 1, name: '가람', job: 'hunter', alive: true, sick: false, health: 82, assignedBuildingId: 4, stage: null },
    { id: 2, name: '나래', job: 'woodcutter', alive: true, sick: true, health: 68, assignedBuildingId: null, stage: null },
    { id: 3, name: '다온', job: 'farmer', alive: true, sick: false, health: 42, assignedBuildingId: 7, stage: null },
    { id: 4, name: '라온', job: 'idle', alive: true, sick: false, health: 100, assignedBuildingId: null, stage: 'child' },
    { id: 5, name: '마루', job: 'idle', alive: true, sick: false, health: 74, assignedBuildingId: null, stage: null, special: true, quarantinedUntil: 22 },
    { id: 6, name: '바다', job: 'builder', alive: false, sick: false, health: 0, assignedBuildingId: null, stage: null },
    { id: 7, name: '사라', job: 'shaman', alive: true, sick: false, health: 91, assignedBuildingId: 9, stage: null, religiousVocation: 'shaman' },
    { id: 8, name: '아라', job: 'monk', alive: true, sick: false, health: 88, assignedBuildingId: 10, stage: null, religiousVocation: 'monk' },
    { id: 9, name: '자람', job: 'idle', alive: true, sick: false, health: 96, assignedBuildingId: null, stage: 'youth', religiousVocation: 'monk' },
  ],
};

const defaults = { query: '', job: 'all', status: 'all', sort: 'arrival' };
const ids = filters => filteredResidents(state, { ...defaults, ...filters }).map(resident => resident.id);

assert.deepEqual(ids({}), [1, 2, 3, 4, 5, 6, 7, 8, 9], 'arrival order preserves the existing resident list order');
assert.deepEqual(ids({ query: '나' }), [2], 'name search narrows the resident list');
assert.deepEqual(ids({ job: 'farmer' }), [3], 'job filter selects the requested role');
assert.deepEqual(ids({ job: 'religious' }), [7, 8, 9],
  'the combined religion filter includes shamans, monks, and monk novices');
assert.deepEqual(ids({ status: 'attention' }), [2, 3, 5], 'health attention includes sickness, low health, and quarantine');
assert.deepEqual(ids({ status: 'workplace' }), [2, 5], 'workplace filter excludes children and finds adults without an assignment');
assert.deepEqual(ids({ status: 'young' }), [4, 9], 'life-stage filter finds children and youths');
assert.deepEqual(ids({ status: 'special' }), [5], 'special-resident filter remains available');
assert.deepEqual(ids({ status: 'dead' }), [6], 'death records can still be reviewed');
assert.deepEqual(ids({ sort: 'health' }).slice(0, 3), [3, 2, 5], 'health sort puts urgent living residents first');
assert.deepEqual(ids({ sort: 'workplace' }).slice(0, 2), [2, 5], 'workplace sort prioritizes adults without a worksite');

console.log('resident list presentation tests passed');
