import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sfxSource = readFileSync(new URL('../../src/sound/sfx.ts', import.meta.url), 'utf8');
const typeSource = readFileSync(new URL('../../src/game/types.ts', import.meta.url), 'utf8');
const screenSource = readFileSync(new URL('../../src/components/TacticalBattleScreen.tsx', import.meta.url), 'utf8');
const battleSource = readFileSync(new URL('../../src/game/tacticalBattle.ts', import.meta.url), 'utf8');
const assaultSource = readFileSync(new URL('../../src/game/tacticalAssault.ts', import.meta.url), 'utf8');
const huntSource = readFileSync(new URL('../../src/game/tacticalHunt.ts', import.meta.url), 'utf8');

const samples = {
  cannon: 'public/assets/audio/battle/cannon.mp3',
  musket: 'public/assets/audio/battle/musket.mp3',
  arrow: 'public/assets/audio/battle/arrow.mp3',
  drum: 'public/assets/audio/battle/drum.mp3',
  horn: 'public/assets/audio/battle/horn.mp3',
  ready: 'public/assets/audio/battle/ready.mp3',
  muster: 'public/assets/audio/battle/muster.mp3',
  melee1: 'public/assets/audio/battle/melee-1.mp3',
  melee2: 'public/assets/audio/battle/melee-2.mp3',
};
for (const [name, relativePath] of Object.entries(samples)) {
  const path = `${root}${relativePath}`;
  assert.equal(existsSync(path), true, `${name} sample must be copied into public assets`);
  assert.ok(statSync(path).size > 1_000, `${name} sample must not be empty`);
}

assert.match(sfxSource, /export const BATTLE_SAMPLE_PATHS/);
assert.match(sfxSource, /export function playWeaponVolley/);
assert.match(sfxSource, /export function playWeaponSalvo/,
  'mixed weapon fire needs one shared salvo scheduler');
assert.match(sfxSource, /export function playMeleeClash/,
  'melee needs a participant-aware sample scheduler');
assert.match(sfxSource, /arrow:\s*\d+[,\s]*musket:\s*\d+[,\s]*cannon:\s*\d+/,
  'each weapon needs a short, explicit shot stagger');
assert.match(sfxSource, /for \(let index = 0; index < shotCount; index\+\+\)/,
  'one sample source must be scheduled for every shooter');
assert.match(typeSource, /shots\?:\s*\{[\s\S]*arrows\?: number;[\s\S]*muskets\?: number;[\s\S]*cannons\?: number;/,
  'animation events must carry the number of shooters by weapon');
assert.match(screenSource, /playTacticalEventSfx\(events\[index\]\)/,
  'event playback must use shot-count-aware sound routing');
assert.match(screenSource, /playWeaponSalvo\(shots\)/,
  'arrow and musket shots in one event must share a playback base time');
assert.match(screenSource, /readyVolley:\s*'battleReady'/,
  'volley preparation must use the supplied ready sample');
assert.match(screenSource, /muster:\s*'militiaMuster'/,
  'militia muster must use the supplied muster sample');
assert.match(screenSource, /playMeleeClash\(event\.meleeParticipants/,
  'melee events must route their engagement size');
assert.match(screenSource, /function defenderFiringForEvent[\s\S]*event\.side[\s\S]*event\.shots/,
  'sprite firing must respect the firing side and actual shot kinds');
assert.match(screenSource, /playSfx\('raidHorn'\)/,
  'the opening of a direct tactical battle must sound the horn');
assert.match(battleSource, /shots:\s*\{/, 'village defense volleys must record shooter counts');
assert.match(assaultSource, /shots:\s*\{/, 'lair assault volleys must record shooter counts');
assert.match(huntSource, /shots:\s*(?:\{|volleyShots)/, 'hunt volleys must record shooter counts');

const compiledDir = mkdtempSync(join(tmpdir(), 'northern-tactical-sfx-tests-'));
const compiledSource = ts.transpileModule(sfxSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledPath = join(compiledDir, 'sfx.mjs');
writeFileSync(compiledPath, compiledSource, 'utf8');
const sfx = await import(pathToFileURL(compiledPath).href);
assert.equal(typeof sfx.buildWeaponVolleySchedule, 'function');
const mixedSchedule = sfx.buildWeaponVolleySchedule({ arrows: 3, muskets: 2 });
assert.equal(mixedSchedule.length, 5, 'one source must be scheduled per shooter');
assert.equal(mixedSchedule.filter(shot => shot.kind === 'arrow').length, 3);
assert.equal(mixedSchedule.filter(shot => shot.kind === 'musket').length, 2);
for (const kind of ['arrow', 'musket']) {
  const delays = mixedSchedule.filter(shot => shot.kind === kind).map(shot => shot.delaySeconds);
  assert.equal(new Set(delays).size, delays.length, `${kind} shooters need distinct audible onsets`);
}
assert.notEqual(
  mixedSchedule.find(shot => shot.kind === 'arrow').delaySeconds,
  mixedSchedule.find(shot => shot.kind === 'musket').delaySeconds,
  'mixed weapon samples must not collapse onto the exact same onset',
);
assert.equal(typeof sfx.meleeStrikeCount, 'function');
assert.equal(typeof sfx.buildMeleeStrikeSchedule, 'function');
assert.ok(sfx.meleeStrikeCount(30) > sfx.meleeStrikeCount(4),
  'larger engagements must produce more audible impacts');
assert.ok(sfx.meleeStrikeCount(10_000) <= 24,
  'very large engagements must not overload the audio graph');
const meleeSchedule = sfx.buildMeleeStrikeSchedule(30);
assert.equal(meleeSchedule.length, sfx.meleeStrikeCount(30));
assert.ok(meleeSchedule.some(hit => hit.kind === 'melee1'));
assert.ok(meleeSchedule.some(hit => hit.kind === 'melee2'));
assert.equal(new Set(meleeSchedule.map(hit => hit.delaySeconds)).size, meleeSchedule.length,
  'each melee impact needs a distinct onset');
assert.match(typeSource, /meleeParticipants\?: number;/,
  'melee animation events must carry their engagement size');
assert.match(battleSource, /meleeParticipants:/,
  'village defense melee must expose its participant count');
assert.match(assaultSource, /meleeParticipants:/,
  'lair assault melee must expose its participant count');

console.log('tactical sample sfx tests passed');
