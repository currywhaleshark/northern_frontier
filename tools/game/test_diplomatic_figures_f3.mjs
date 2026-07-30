import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-diplomatic-figures-f3-tests-'));
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
const figures = await import(pathToFileURL(join(compiledDir, 'diplomaticFigures.mjs')).href);
const raids = await import(pathToFileURL(join(compiledDir, 'raids.mjs')).href);
const naming = await import(pathToFileURL(join(compiledDir, 'settlementName.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const suspicion = await import(pathToFileURL(join(compiledDir, 'suspicion.mjs')).href);

{
  const state = simulation.newGame(73060);
  const leader = figures.factionLeaderFor(state, '홀라온 야인');
  assert.ok(leader);
  assert.equal(figures.factionLeaderSubject(state, '홀라온 야인'), `${leader.name} ${leader.title}`);
  assert.equal(figures.factionRaidPartyLabel(state, '홀라온 야인'), `${leader.name} ${leader.title}의 무리`);
  assert.equal(figures.factionLeaderSubject(state, '변경 마적'), '변경 마적');
  assert.equal(figures.factionRaidPartyLabel(state, '변경 마적'), '변경 마적');

  assert.equal(raids.openExtortionDemand(state, () => 0, false, 40, '홀라온 야인'), true);
  assert.match(state.pendingChoice.title, new RegExp(leader.name));
  assert.match(state.pendingChoice.body, new RegExp(`${leader.name} ${leader.title}의 무장 사절`));
  state.pendingChoice = null;

  raids.openRaidChoice(state, () => 0, true, 40, '홀라온 야인');
  assert.match(state.pendingChoice.title, new RegExp(`${leader.name} ${leader.title}의 무리`));
  assert.match(state.pendingChoice.body, new RegExp(`${leader.name} ${leader.title}의 무리`));
}

{
  const state = simulation.newGame(73061);
  const commander = state.borderCommander.name;
  state.suspicion = 50;
  suspicion.openInspection(state);
  assert.match(state.pendingChoice.title, new RegExp(commander));
  assert.match(state.pendingChoice.body, new RegExp(commander));
  assert.ok(state.log.at(-1).text.includes(commander));

  state.pendingChoice = null;
  state.suspicion = 72;
  suspicion.updateSuspicion(state, () => 1);
  assert.ok(state.log.some(entry => entry.text.includes(`${commander} 명의의 견책`)));
}

{
  const state = simulation.newGame(73062);
  const commander = state.borderCommander.name;
  const oldName = state.settlementName;
  assert.equal(naming.requestSettlementRename(state, '새봄'), null);
  state.day = state.pendingSettlementRename.dueDay;
  naming.processSettlementRename(state);
  assert.equal(state.settlementName, '새봄');
  assert.ok(state.log.at(-1).text.includes(commander));
  assert.ok(state.annals.at(-1).text.includes(commander));
  assert.notEqual(oldName, state.settlementName);
}

const battlesSource = readFileSync(new URL('../../src/game/battles.ts', import.meta.url), 'utf8');
assert.match(battlesSource, /factionRaidPartyLabel\(state, battle\.faction\)/);

console.log('diplomatic figures F3 tests passed');
