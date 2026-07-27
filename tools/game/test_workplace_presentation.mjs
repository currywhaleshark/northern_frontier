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
  isInteriorWorkplace,
  residentActiveWorkplace,
  residentInteriorWorkplace,
  workplaceActivityStyle,
  workplacePresentation,
} = await import(moduleUrl);

const expectedInterior = [
  'watermill', 'smithy', 'clinic', 'tannery', 'weavingHouse', 'smokehouse',
  'school', 'office', 'shrine', 'hermitage',
];
const expectedYard = ['woodShed', 'charcoalKiln', 'stable', 'nitreYard', 'dryingRack', 'onggiKiln'];
const expectedVisible = ['field', 'paddy', 'ferry', 'cemetery', 'mine', 'lumberCamp', 'huntLodge', 'herbHut'];

for (const type of expectedInterior) {
  assert.equal(workplacePresentation(type).mode, 'interior', `${type} workers are represented indoors`);
  assert.equal(isInteriorWorkplace(type), true);
}
for (const type of expectedYard) {
  assert.equal(workplacePresentation(type).mode, 'yard', `${type} workers remain visible in the yard`);
  assert.ok(workplaceActivityStyle(type), `${type} keeps a building activity effect`);
}
for (const type of expectedVisible) {
  assert.equal(workplacePresentation(type).mode, 'visible', `${type} workers remain fully visible`);
  assert.equal(isInteriorWorkplace(type), false);
}
assert.equal(workplaceActivityStyle('smithy'), 'fire');
assert.equal(workplaceActivityStyle('woodShed'), 'craft');
assert.equal(workplaceActivityStyle('clinic'), 'service');

const smithy = { id: 10, type: 'smithy', built: true, x: 5, y: 5 };
const charcoal = { id: 20, type: 'charcoalKiln', built: true, x: 8, y: 8 };
const buildingById = new Map([[smithy.id, smithy], [charcoal.id, charcoal]]);
const resident = (id, overrides = {}) => ({
  id, alive: true, phase: 'working', assignedBuildingId: smithy.id,
  x: 4, y: 5, px: 4, py: 5, ...overrides,
});

assert.equal(residentActiveWorkplace(resident(1), buildingById), smithy);
assert.equal(residentInteriorWorkplace(resident(1), buildingById), smithy,
  'a stationary working smith is represented inside the smithy');
assert.equal(residentInteriorWorkplace(resident(2, { px: 3 }), buildingById), null,
  'a worker remains visible while movement interpolation is running');
assert.equal(residentInteriorWorkplace(resident(3, { phase: 'rest' }), buildingById), null,
  'an idle assigned worker remains visible');
assert.equal(residentInteriorWorkplace(resident(4, { assignedBuildingId: charcoal.id }), buildingById), null,
  'yard workers are active but never hidden');

const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
assert.match(rendererSource, /presentation\.indoorResidentIds\.has\(r\.id\)/,
  'the resident pass hides only snapshot-classified interior workers');
assert.match(rendererSource, /workplaceActiveCountByBuilding\.get\(b\.id\)/,
  'interior and yard activity effects use the snapshot active count');
assert.match(rendererSource, /작업 \$\{activeCount\}\/\$\{slotCount\}/,
  'expanded worker slots show the active worker count');

console.log('workplace presentation tests passed');
