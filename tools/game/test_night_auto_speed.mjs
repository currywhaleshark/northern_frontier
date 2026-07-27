import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function transpile(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
    if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
    return `${start}${spec}.mjs${end}`;
  });
}

function transpileDirectory(sourceUrl, targetDir) {
  mkdirSync(targetDir, { recursive: true });
  for (const file of readdirSync(sourceUrl).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, sourceUrl), 'utf8');
    writeFileSync(join(targetDir, file.replace(/\.ts$/, '.mjs')), transpile(source), 'utf8');
  }
}

const rootDir = mkdtempSync(join(tmpdir(), 'northern-night-speed-'));
transpileDirectory(new URL('../../src/game/', import.meta.url), join(rootDir, 'game'));
transpileDirectory(new URL('../../src/ui/', import.meta.url), join(rootDir, 'ui'));

const {
  SLEEPING_NIGHT_SPEED,
  createNightAutoSpeedState,
  markNightSpeedOverride,
  nightAutoSpeedTarget,
} = await import(pathToFileURL(join(rootDir, 'ui', 'nightAutoSpeed.mjs')).href);

function snapshot(day, subTick, phases = ['sleeping', 'sleeping']) {
  return {
    day,
    subTick,
    residents: phases.map((phase, id) => ({ id, alive: true, phase })),
  };
}

const control = createNightAutoSpeedState();
assert.equal(nightAutoSpeedTarget(control, snapshot(3, 57), 3, true), null,
  'evening does not trigger automatic speed');
assert.equal(nightAutoSpeedTarget(control, snapshot(3, 60, ['sleeping', 'toHome']), 3, true), null,
  'night waits until every living resident is asleep');
assert.equal(nightAutoSpeedTarget(control, snapshot(3, 61), 3, true), SLEEPING_NIGHT_SPEED,
  'the first fully sleeping night frame triggers 10x speed');
assert.equal(nightAutoSpeedTarget(control, snapshot(3, 62), 10, true), null,
  'the same night never forces 10x twice');
assert.equal(nightAutoSpeedTarget(control, snapshot(4, 0), 10, true), 3,
  'dawn restores the speed used before automatic acceleration');

assert.equal(nightAutoSpeedTarget(control, snapshot(4, 61), 1, true), SLEEPING_NIGHT_SPEED);
markNightSpeedOverride(control, snapshot(4, 62));
assert.equal(nightAutoSpeedTarget(control, snapshot(4, 63), 1, true), null,
  'a manual night speed change suppresses the rest of that night');
assert.equal(nightAutoSpeedTarget(control, snapshot(5, 0), 1, true), null,
  'manual night speed remains unchanged at dawn');
assert.equal(nightAutoSpeedTarget(control, snapshot(5, 61), 1, true), SLEEPING_NIGHT_SPEED,
  'automatic acceleration becomes eligible again the following night');

const disabled = createNightAutoSpeedState();
assert.equal(nightAutoSpeedTarget(disabled, snapshot(6, 61), 3, false), null,
  'disabled preference never accelerates the night');

const disabledMidNight = createNightAutoSpeedState();
assert.equal(nightAutoSpeedTarget(disabledMidNight, snapshot(7, 61), 3, true), SLEEPING_NIGHT_SPEED);
assert.equal(nightAutoSpeedTarget(disabledMidNight, snapshot(7, 62), 10, false), 3,
  'turning the preference off during automatic acceleration restores the previous speed');

console.log('night auto speed tests passed');
