import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/wallFamilyAssets.ts', import.meta.url), 'utf8');
const gateSource = readFileSync(new URL('../../src/render/wallGateAssets.ts', import.meta.url), 'utf8');
const atlasSource = readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const assets = await import(moduleUrl);
const gateOutput = ts.transpileModule(gateSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const gateModuleUrl = `data:text/javascript;base64,${Buffer.from(gateOutput).toString('base64')}`;
const gateAssets = await import(gateModuleUrl);

assert.deepEqual(assets.WALL_FAMILY_SHEET, {
  tileSize: 28,
  spriteHeight: 40,
  columns: 3,
  rows: 6,
  src: '/assets/wall-family-modular-v1.png',
});

assert.deepEqual(assets.WALL_FAMILY_WALL_TYPES, ['palisade', 'earthFort', 'stoneWall']);
assert.deepEqual(assets.WALL_MODULAR_PIECES, ['pillar', 'horizontal', 'vertical']);

assert.equal(assets.isWallFamilyWallType('palisade'), true);
assert.equal(assets.isWallFamilyWallType('earthFort'), true);
assert.equal(assets.isWallFamilyWallType('stoneWall'), true);
assert.equal(assets.isWallFamilyWallType('gate'), false);
assert.equal(assets.isWallFamilyWallType('hut'), false);

assert.equal(assets.wallVisualMaterial('palisade'), 'wood');
assert.equal(assets.wallVisualMaterial('earthFort'), 'earth');
assert.equal(assets.wallVisualMaterial('stoneWall'), 'stone');

const none = { n: false, e: false, s: false, w: false };
assert.equal(assets.modularWallPiece(none), 'pillar', 'isolated wall renders as pillar');
assert.equal(
  assets.modularWallPiece({ n: false, e: true, s: false, w: false }),
  'pillar',
  'run endpoint renders as pillar',
);
assert.equal(
  assets.modularWallPiece({ n: false, e: true, s: false, w: true }),
  'horizontal',
  'horizontal straight-run interior renders as horizontal segment',
);
assert.equal(
  assets.modularWallPiece({ n: true, e: false, s: true, w: false }),
  'vertical',
  'vertical straight-run interior renders as vertical segment',
);
assert.equal(
  assets.modularWallPiece({ n: true, e: true, s: false, w: false }),
  'pillar',
  'corner renders as pillar',
);
assert.equal(
  assets.modularWallPiece({ n: true, e: true, s: true, w: false }),
  'pillar',
  'T-junction renders as pillar',
);
assert.equal(
  assets.modularWallPiece({ n: true, e: true, s: true, w: true }),
  'pillar',
  'cross junction renders as pillar',
);

assert.deepEqual(
  assets.wallFamilySourceRect('palisade', none, 'summer'),
  { sx: 0, sy: 0, sw: 28, sh: 40 },
  'palisade pillar summer',
);
assert.deepEqual(
  assets.wallFamilySourceRect('earthFort', { n: false, e: true, s: false, w: true }, 'summer'),
  { sx: 28, sy: 40, sw: 28, sh: 40 },
  'earth fort horizontal summer',
);
assert.deepEqual(
  assets.wallFamilySourceRect('stoneWall', { n: true, e: false, s: true, w: false }, 'winter'),
  { sx: 2 * 28, sy: 5 * 40, sw: 28, sh: 40 },
  'stone wall vertical winter',
);
assert.deepEqual(
  assets.wallFamilyPieceSourceRect('palisade', 'horizontal', 'winter'),
  { sx: 28, sy: 3 * 40, sw: 28, sh: 40 },
  'direct piece source rect works',
);

assert.deepEqual(gateAssets.WALL_GATE_SHEET, {
  tileSize: 28,
  spriteHeight: 40,
  columns: 2,
  rows: 2,
  src: '/assets/wall-gate-v1.png',
});

assert.deepEqual(gateAssets.WALL_GATE_ORIENTATIONS, ['horizontal', 'vertical']);
assert.equal(gateAssets.wallGateOrientation(undefined), 'horizontal');
assert.equal(
  gateAssets.wallGateOrientation({ n: false, e: true, s: false, w: true }),
  'horizontal',
  'east-west gate renders as horizontal',
);
assert.equal(
  gateAssets.wallGateOrientation({ n: true, e: false, s: true, w: false }),
  'vertical',
  'north-south gate renders as vertical',
);
assert.equal(
  gateAssets.wallGateOrientation({ n: true, e: true, s: true, w: true }),
  'horizontal',
  'ambiguous gate junction keeps a stable horizontal fallback',
);
assert.deepEqual(
  gateAssets.wallGateSourceRect({ n: false, e: true, s: false, w: true }, 'summer'),
  { sx: 0, sy: 0, sw: 28, sh: 40 },
  'horizontal gate summer',
);
assert.deepEqual(
  gateAssets.wallGateSourceRect({ n: true, e: false, s: true, w: false }, 'winter'),
  { sx: 28, sy: 40, sw: 28, sh: 40 },
  'vertical gate winter',
);

const typecheckSource = `
import type { BuildingTypeId } from '../../src/game/types';
import {
  isWallFamilyWallType,
  modularWallPiece,
  wallFamilyPieceSourceRect,
  wallFamilySourceRect,
  wallVisualMaterial,
} from '../../src/render/wallFamilyAssets';
import {
  wallGateOrientation,
  wallGateSourceRect,
} from '../../src/render/wallGateAssets';

wallFamilySourceRect('palisade', undefined, 'summer');
wallFamilySourceRect('earthFort', undefined, 'winter');
wallFamilySourceRect('stoneWall', undefined, 'summer');
wallFamilyPieceSourceRect('stoneWall', 'vertical', 'winter');
wallVisualMaterial('palisade');
modularWallPiece({ n: true, e: false, s: true, w: false });
wallGateOrientation({ n: false, e: true, s: false, w: true });
wallGateSourceRect(undefined, 'summer');
wallGateSourceRect({ n: true, e: false, s: true, w: false }, 'winter');

function guardedSourceRect(type: BuildingTypeId) {
  if (!isWallFamilyWallType(type)) return undefined;
  return wallFamilySourceRect(type, undefined, 'summer');
}

// @ts-expect-error gates use a separate render path, not the base three-piece wall sheet
wallFamilySourceRect('gate', undefined, 'summer');

// @ts-expect-error non-wall buildings are not valid modular wall source rect types
wallFamilySourceRect('hut', undefined, 'summer');

// @ts-expect-error direct source rect only accepts known modular pieces
wallFamilyPieceSourceRect('palisade', 'corner', 'summer');

const broadType: BuildingTypeId = 'hut';
// @ts-expect-error broad building IDs must be narrowed before rendering modular wall assets
wallFamilySourceRect(broadType, undefined, 'summer');
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

assert.match(
  atlasSource,
  /WALL_FAMILY_SHEET[\s\S]*isWallFamilyWallType[\s\S]*wallFamilySourceRect/,
  'atlas imports modular wall-family sheet metadata and source rect helpers',
);
assert.match(
  atlasSource,
  /wallFamilySheet\s*=\s*new Image\(\)[\s\S]*wallFamilySheet\.src\s*=\s*WALL_FAMILY_SHEET\.src/,
  'atlas loads the modular wall-family image sheet',
);
assert.match(
  atlasSource,
  /loaded >= 14/,
  'atlas readiness includes the modular wall-family image sheet',
);
assert.match(
  atlasSource,
  /WALL_GATE_SHEET[\s\S]*wallGateSourceRect/,
  'atlas imports generated gate sheet metadata and source rect helper',
);
assert.match(
  atlasSource,
  /wallGateSheet\s*=\s*new Image\(\)[\s\S]*wallGateSheet\.src\s*=\s*WALL_GATE_SHEET\.src/,
  'atlas loads the generated wall-gate image sheet',
);
assert.match(
  atlasSource,
  /loaded >= 14/,
  'atlas readiness includes the generated wall-gate image sheet',
);
assert.match(
  atlasSource,
  /function blitWallFamilyBuilding[\s\S]*wallFamilySourceRect/,
  'atlas can blit modular wall-family pieces from the generated sheet',
);
assert.match(
  atlasSource,
  /function blitWallGateBuilding[\s\S]*wallGateSourceRect/,
  'atlas can blit generated wall-gate sprites from the generated sheet',
);
assert.match(
  atlasSource,
  /if \(isWallFamilyWallType\(p\.type\) && wallFamilySheet\)[\s\S]*blitWallFamilyBuilding\(ctx, wallFamilySheet, p\)/,
  'solid wall-family buildings use the modular sprite sheet before procedural fallback',
);
assert.match(
  atlasSource,
  /if \(isGateBuilding\(p\.type\) && wallGateSheet\)[\s\S]*blitWallGateBuilding\(ctx, wallGateSheet, p\)/,
  'gate buildings use the generated gate sprite sheet before procedural fallback',
);
assert.match(
  atlasSource,
  /if \(isGateBuilding\(p\.type\)\)/,
  'gate keeps the procedural wall-family render path as a fallback',
);

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
