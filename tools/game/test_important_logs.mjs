import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const events = await import(pathToFileURL(join(compiledDir, 'events.mjs')).href);
const residents = await import(pathToFileURL(join(compiledDir, 'residents.mjs')).href);
const { residentLogName } = await import(pathToFileURL(join(compiledDir, 'residentLogName.mjs')).href);

assert.equal(residentLogName({
  name: '김봄', job: 'farmer', special: undefined, stage: null, religiousVocation: undefined,
}), '농부 김봄', 'ordinary adults receive their current job before their name');
assert.equal(residentLogName({
  name: '이산', job: 'idle', special: undefined, stage: 'youth', religiousVocation: undefined,
}), '소년 이산', 'growing residents use their life stage as the log role');
assert.equal(residentLogName({
  name: '박달', job: 'idle', special: undefined, stage: 'youth', religiousVocation: 'monk',
}), '동자승 박달', 'a novice uses the religious role instead of the generic youth label');
assert.equal(residentLogName({
  name: '착호 포수 박돌개', job: 'hunter', special: 'tigerHunter', stage: null, religiousVocation: undefined,
}), '착호 포수 박돌개', 'named residents keep their existing titled name');

const state = simulation.newGame(2026071020);
assert.equal(state.log.at(-1)?.important, true, 'the annual tribute announcement is important');

events.addLog(state, 'ordinary village news', 'info');
assert.equal(state.log.at(-1)?.important, undefined, 'ordinary logs stay out of the important feed');

events.addLog(state, 'raiders are approaching', 'raid');
assert.equal(state.log.at(-1)?.important, true, 'raid logs are important by default');

events.addLog(state, 'explicit warning', 'bad', true);
assert.equal(state.log.at(-1)?.important, true, 'callers can promote any log kind');

const victim = state.residents.find(resident => resident.alive);
assert.ok(victim);
victim.name = '김봄';
victim.job = 'farmer';
residents.killResident(state, victim, 'test cause');
assert.equal(state.log.at(-1)?.important, true, 'resident deaths are always important');
assert.match(state.log.at(-1)?.text ?? '', /^농부 김봄/,
  'resident death logs identify an ordinary resident by job and name');
assert.equal(state.corpses.at(-1)?.residentLabel, '농부 김봄',
  'the death-time role is preserved for later corpse and burial logs');

console.log('important log tests passed');
