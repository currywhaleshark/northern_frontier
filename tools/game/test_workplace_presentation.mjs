import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/game/workplacePresentation.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const {
  activeInteriorWorkers,
  isInteriorWorkplace,
  residentInteriorWorkplace,
  workplaceActivityStyle,
} = await import(moduleUrl);

assert.equal(workplaceActivityStyle('smithy'), 'fire');
assert.equal(workplaceActivityStyle('woodShed'), 'craft');
assert.equal(workplaceActivityStyle('clinic'), 'service');
assert.equal(isInteriorWorkplace('tannery'), true);
assert.equal(isInteriorWorkplace('field'), false, 'farmers remain visible on their field tiles');
assert.equal(isInteriorWorkplace('ferry'), false, 'fishers remain visible at the waterfront');
assert.equal(isInteriorWorkplace('cemetery'), false, 'undertakers remain visible in the cemetery grounds');

const smithy = { id: 10, type: 'smithy', built: true, x: 5, y: 5 };
const field = { id: 20, type: 'field', built: true, x: 8, y: 8 };
const resident = (id, overrides = {}) => ({
  id, alive: true, phase: 'working', assignedBuildingId: smithy.id,
  x: 4, y: 5, px: 4, py: 5, ...overrides,
});
const state = {
  buildings: [smithy, field],
  residents: [
    resident(1),
    resident(2, { px: 3 }),
    resident(3, { phase: 'rest' }),
    resident(4, { assignedBuildingId: field.id, x: 8, y: 8, px: 8, py: 8 }),
  ],
};

assert.equal(residentInteriorWorkplace(state, state.residents[0]), smithy,
  'a stationary working smith is represented inside the smithy');
assert.equal(residentInteriorWorkplace(state, state.residents[1]), null,
  'a worker remains visible while the final movement interpolation is running');
assert.equal(residentInteriorWorkplace(state, state.residents[2]), null,
  'an idle assigned worker remains visible outside');
assert.equal(residentInteriorWorkplace(state, state.residents[3]), null,
  'field workers are never hidden by the interior presentation');

const active = activeInteriorWorkers(state);
assert.deepEqual([...active.residentIds], [1]);
assert.equal(active.countByBuilding.get(smithy.id), 1);

const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
assert.match(rendererSource, /indoorWorkers\.residentIds\.has\(r\.id\)/,
  'the resident pass hides active interior workers');
assert.match(rendererSource, /drawWorkplaceActivity\([^)]*activeWorkerCount/s,
  'active interior workers drive the building activity effect');
assert.match(rendererSource, /작업 \$\{activeCount\}\/\$\{slotCount\}/,
  'expanded worker slots show the active worker count');

console.log('workplace presentation tests passed');
