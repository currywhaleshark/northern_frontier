import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-targeting-'));
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
const targeting = await import(pathToFileURL(join(compiledDir, 'tacticalTargeting.mjs')).href);

assert.equal(targeting.defaultRaiderFormationLine('court-melee'), 'front');
assert.equal(targeting.defaultRaiderFormationLine('court-gunner'), 'middle');
assert.equal(targeting.defaultRaiderFormationLine('holaon-horse-archer'), 'middle');
assert.equal(targeting.defaultRaiderFormationLine('court-artillery'), 'rear');
assert.equal(targeting.defaultRaiderFormationLine('court-melee', true), 'rear', 'enemy leaders occupy the rear line');

const defender = (weapon, line = 'front') => ({
  id: `${weapon ?? 'unarmed'}-${line}`,
  kind: weapon === 'musket' ? 'militia-musket' : weapon === 'hornBow' ? 'militia-bow' : 'militia-spear',
  role: 'militia', weapon, readyMuskets: weapon === 'musket' ? 1 : 0,
  label: 'test', residentIds: [1], count: 1, zoneId: 'wall', command: 'hold',
  power: 10, wounded: 0, killed: 0, line,
});

const frontal = {
  direction: 'frontal', contactLine: 'front', meleeContact: false, prepareVolleyApplied: false,
};
const rear = {
  direction: 'rear', contactLine: 'rear', meleeContact: false, prepareVolleyApplied: false,
};

assert.deepEqual(targeting.canTargetLine(defender('spear'), 'front', frontal), {
  allowed: true, efficiency: 1, reason: null,
});
assert.equal(targeting.canTargetLine(defender('spear'), 'middle', frontal).allowed, false);
assert.match(targeting.canTargetLine(defender('spear'), 'middle', frontal).reason, /접촉 열/);
assert.equal(targeting.canTargetLine(defender('spear', 'rear'), 'rear', rear).allowed, true,
  'rear-facing melee can attack the first rear contact line');
assert.equal(targeting.canTargetLine(defender('spear', 'rear'), 'front', rear).allowed, false);

assert.equal(targeting.canTargetLine(defender('musket'), 'front', frontal).efficiency, 1);
assert.equal(targeting.canTargetLine(defender('musket'), 'middle', frontal).efficiency, 1);
assert.equal(targeting.canTargetLine(defender('musket'), 'rear', frontal).allowed, false);
assert.match(targeting.canTargetLine(defender('musket'), 'rear', frontal).reason, /후열/);
assert.equal(targeting.canTargetLine(defender('musket'), 'middle', {
  ...frontal, meleeContact: true,
}).efficiency, 0.65);
assert.equal(targeting.canTargetLine(defender('musket'), 'middle', {
  ...frontal, meleeContact: true, prepareVolleyApplied: true,
}).efficiency, 0.8);

assert.equal(targeting.canTargetLine(defender('hornBow'), 'front', frontal).efficiency, 1);
assert.equal(targeting.canTargetLine(defender('hornBow'), 'middle', frontal).efficiency, 0.9);
assert.equal(targeting.canTargetLine(defender('hornBow'), 'rear', frontal).efficiency, 0.75);
assert.equal(targeting.tacticalTargetingConcentration(defender('spear')), 0.85);
assert.equal(targeting.tacticalTargetingConcentration(defender('musket')), 0.8);
assert.equal(targeting.tacticalTargetingConcentration(defender('hornBow')), 0.65);

console.log('tactical targeting tests passed');
