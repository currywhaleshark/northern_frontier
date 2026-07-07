import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function rewriteImports(output) {
  return output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
    if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
    return `${start}${spec}.mjs${end}`;
  });
}

function transpileTs(sourcePath, outPath) {
  const source = readFileSync(sourcePath, 'utf8');
  const output = rewriteImports(ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText);
  writeFileSync(outPath, output, 'utf8');
}

function compileModules() {
  const outDir = mkdtempSync(join(tmpdir(), 'northern-militia-weapon-tests-'));
  const gameOut = join(outDir, 'game');
  const renderOut = join(outDir, 'render');
  mkdirSync(gameOut);
  mkdirSync(renderOut);

  const gameDir = new URL('../../src/game/', import.meta.url);
  for (const file of readdirSync(gameDir).filter(file => file.endsWith('.ts'))) {
    transpileTs(new URL(file, gameDir), join(gameOut, file.replace(/\.ts$/, '.mjs')));
  }
  for (const file of ['militiaWeaponAssets.ts', 'militiaWeaponAssignment.ts']) {
    transpileTs(new URL(`../../src/render/${file}`, import.meta.url), join(renderOut, file.replace(/\.ts$/, '.mjs')));
  }
  return outDir;
}

const compiledDir = compileModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'game', 'simulation.mjs')).href);
const assets = await import(pathToFileURL(join(compiledDir, 'render', 'militiaWeaponAssets.mjs')).href);
const assignment = await import(pathToFileURL(join(compiledDir, 'render', 'militiaWeaponAssignment.mjs')).href);

assert.equal(assets.MILITIA_WEAPON_SHEET.residentWidth, 28);
assert.equal(assets.MILITIA_WEAPON_SHEET.spriteHeight, 40);
assert.equal(assets.MILITIA_WEAPON_SHEET.columns, 3);
assert.equal(assets.MILITIA_WEAPON_SHEET.rows, 2);
assert.equal(assets.MILITIA_WEAPON_SHEET.src, '/assets/militia-weapons-generated-v1.png');
assert.deepEqual(assets.MILITIA_WEAPON_TYPES, ['spears', 'hornBows', 'muskets']);
assert.deepEqual(assets.militiaWeaponSourceRect('spears', 'male'), { sx: 0, sy: 0, sw: 28, sh: 40 });
assert.deepEqual(assets.militiaWeaponSourceRect('hornBows', 'male'), { sx: 28, sy: 0, sw: 28, sh: 40 });
assert.deepEqual(assets.militiaWeaponSourceRect('muskets', 'female'), { sx: 56, sy: 40, sw: 28, sh: 40 });

{
  const state = simulation.newGame(8282);
  for (const resident of state.residents) resident.job = 'idle';
  const militia = state.residents.slice(0, 4);
  for (const resident of militia) resident.job = 'militia';
  state.resources.muskets = 1;
  state.resources.gunpowder = 2;
  state.resources.hornBows = 1;
  state.resources.spears = 1;

  assert.deepEqual(
    militia.map(resident => assignment.militiaWeaponForResident(state, resident)),
    ['muskets', 'hornBows', 'spears', undefined],
  );
}

{
  const state = simulation.newGame(8283);
  for (const resident of state.residents) resident.job = 'idle';
  const militia = state.residents.slice(0, 2);
  for (const resident of militia) resident.job = 'militia';
  state.resources.muskets = 2;
  state.resources.gunpowder = 0;
  state.resources.hornBows = 0;
  state.resources.spears = 2;

  assert.deepEqual(
    militia.map(resident => assignment.militiaWeaponForResident(state, resident)),
    ['spears', 'spears'],
    'muskets do not display without gunpowder because defense allocation falls back to cold weapons',
  );
  assert.equal(assignment.militiaWeaponForResident(state, state.residents[2]), undefined);
}

console.log('militia weapon asset tests passed');
