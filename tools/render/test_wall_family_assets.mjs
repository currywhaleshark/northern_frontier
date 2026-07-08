import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/wallFamilyAssets.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const assets = await import(moduleUrl);

assert.deepEqual(assets.WALL_FAMILY_SHEET, {
  tileSize: 28,
  spriteHeight: 40,
  columns: 16,
  rows: 12,
  src: '/assets/wall-family-generated-v1.png',
});

assert.equal(assets.wallConnectionMask({ n: false, e: false, s: false, w: false }), 0);
assert.equal(assets.wallConnectionMask({ n: true, e: false, s: false, w: false }), 1);
assert.equal(assets.wallConnectionMask({ n: false, e: true, s: false, w: false }), 2);
assert.equal(assets.wallConnectionMask({ n: false, e: false, s: true, w: false }), 4);
assert.equal(assets.wallConnectionMask({ n: false, e: false, s: false, w: true }), 8);
assert.equal(assets.wallConnectionMask({ n: true, e: true, s: true, w: true }), 15);

assert.deepEqual(
  assets.wallFamilySourceRect('palisade', { n: true, e: false, s: true, w: false }, 'summer'),
  { sx: 5 * 28, sy: 0, sw: 28, sh: 40 },
);
assert.deepEqual(
  assets.wallFamilySourceRect('earthFort', { n: false, e: true, s: false, w: true }, 'summer'),
  { sx: 10 * 28, sy: 40, sw: 28, sh: 40 },
);
assert.deepEqual(
  assets.wallFamilySourceRect('stoneWall', { n: true, e: true, s: true, w: true }, 'winter'),
  { sx: 15 * 28, sy: 8 * 40, sw: 28, sh: 40 },
);

const originConnections = { n: false, e: false, s: false, w: false };
const sourceRectCases = [
  ['palisade summer', 'palisade', 'summer', undefined, 0],
  ['earth fort summer', 'earthFort', 'summer', undefined, 1],
  ['stone wall summer', 'stoneWall', 'summer', undefined, 2],
  ['wood gate summer', 'gate', 'summer', { n: 'palisade' }, 3],
  ['earth gate summer', 'gate', 'summer', { n: 'earthFort' }, 4],
  ['stone gate summer', 'gate', 'summer', { n: 'stoneWall' }, 5],
  ['palisade winter', 'palisade', 'winter', undefined, 6],
  ['earth fort winter', 'earthFort', 'winter', undefined, 7],
  ['stone wall winter', 'stoneWall', 'winter', undefined, 8],
  ['wood gate winter', 'gate', 'winter', { n: 'gate' }, 9],
  ['earth gate winter', 'gate', 'winter', { n: 'earthFort' }, 10],
  ['stone gate winter', 'gate', 'winter', { n: 'stoneWall' }, 11],
];
for (const [label, type, season, adjacentTypes, row] of sourceRectCases) {
  assert.deepEqual(
    assets.wallFamilySourceRect(type, originConnections, season, adjacentTypes),
    { sx: 0, sy: row * 40, sw: 28, sh: 40 },
    label,
  );
}

assert.equal(assets.gateVisualMaterial({ n: 'palisade' }), 'wood');
assert.equal(assets.gateVisualMaterial({ n: 'earthFort', s: 'palisade' }), 'earth');
assert.equal(assets.gateVisualMaterial({ e: 'stoneWall', w: 'earthFort' }), 'stone');
assert.equal(assets.gateVisualMaterial({ n: 'gate', s: 'gate' }), 'wood');

assert.deepEqual(
  assets.wallFamilySourceRect('gate', { n: false, e: true, s: false, w: true }, 'summer', { e: 'earthFort' }),
  { sx: 10 * 28, sy: 4 * 40, sw: 28, sh: 40 },
);
assert.deepEqual(
  assets.wallFamilySourceRect('gate', { n: false, e: true, s: false, w: true }, 'winter', { w: 'stoneWall' }),
  { sx: 10 * 28, sy: 11 * 40, sw: 28, sh: 40 },
);

const typecheckSource = `
import type { BuildingTypeId } from '../../src/game/types';
import type { WallAdjacentTypes } from '../../src/game/walls';
import { gateVisualMaterial, wallFamilySourceRect } from '../../src/render/wallFamilyAssets';

wallFamilySourceRect('palisade', undefined, 'summer');
wallFamilySourceRect('earthFort', undefined, 'winter');
wallFamilySourceRect('stoneWall', undefined, 'summer');
wallFamilySourceRect('gate', undefined, 'winter', { n: 'stoneWall' });
gateVisualMaterial({ n: 'palisade', s: 'gate' });

// @ts-expect-error non-wall buildings are not valid wall-family source rect types
wallFamilySourceRect('hut', undefined, 'summer');

const broadType: BuildingTypeId = 'hut';
// @ts-expect-error broad building IDs must be narrowed before rendering wall-family assets
wallFamilySourceRect(broadType, undefined, 'summer');

// @ts-expect-error gate visual material only accepts wall-family adjacent values
gateVisualMaterial({ n: 'hut' });

const broadAdjacent: WallAdjacentTypes = { n: 'hut' };
// @ts-expect-error broad adjacent building types must be narrowed before choosing gate material
gateVisualMaterial(broadAdjacent);
`;

const typecheckFileName = fileURLToPath(new URL('./wall_family_assets_typecheck.ts', import.meta.url));
const typecheckOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  allowImportingTsExtensions: true,
};
const host = ts.createCompilerHost(typecheckOptions);
const typecheckFileKey = normalizeFileName(typecheckFileName);
const getSourceFile = host.getSourceFile.bind(host);
const fileExists = host.fileExists.bind(host);
const readFile = host.readFile.bind(host);
host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
  if (normalizeFileName(fileName) === typecheckFileKey) {
    return ts.createSourceFile(fileName, typecheckSource, languageVersion, true);
  }
  return getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
};
host.fileExists = (fileName) => normalizeFileName(fileName) === typecheckFileKey || fileExists(fileName);
host.readFile = (fileName) => (normalizeFileName(fileName) === typecheckFileKey ? typecheckSource : readFile(fileName));

const typecheckProgram = ts.createProgram([typecheckFileName], typecheckOptions, host);
const typecheckDiagnostics = ts.getPreEmitDiagnostics(typecheckProgram);
assert.deepEqual(typecheckDiagnostics.map(formatDiagnostic), []);

console.log('wall family asset tests passed');

function formatDiagnostic(diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (!diagnostic.file || diagnostic.start === undefined) {
    return message;
  }
  const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${line + 1}:${character + 1} ${message}`;
}

function normalizeFileName(fileName) {
  return fileName.replaceAll('\\', '/').toLowerCase();
}
