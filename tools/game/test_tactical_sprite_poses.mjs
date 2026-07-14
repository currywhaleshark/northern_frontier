import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/tacticalCharacterAssets.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-sprite-poses-'));
const modulePath = join(outDir, 'tacticalCharacterAssets.mjs');
writeFileSync(modulePath, output, 'utf8');
const assets = await import(pathToFileURL(modulePath).href);

assert.deepEqual(assets.TACTICAL_POSE_ROWS, {
  idle: 0,
  attack: 1,
  hurt: 2,
  wounded: 3,
});

assert.deepEqual(assets.tacticalDefenderPoseCell('watchman', null, 'male', 'attack'), {
  sheet: 'roles', column: 4, row: 1,
});
assert.deepEqual(assets.tacticalDefenderPoseCell('hunter', null, 'female', 'wounded'), {
  sheet: 'roles', column: 7, row: 3,
});
assert.deepEqual(assets.tacticalDefenderPoseCell('militia', 'hornBow', 'female', 'hurt'), {
  sheet: 'weapons', column: 3, row: 2,
});
assert.deepEqual(assets.tacticalDefenderPoseCell('hunter', 'spear', 'male', 'attack'), {
  sheet: 'weapons', column: 0, row: 1,
});
assert.equal(assets.tacticalRaiderPoseCell('변경 마적', 'attack')?.row, 1);
assert.equal(assets.tacticalCourtPoseCell('court-artillery', 'hurt').column, 4);
assert.equal(assets.tacticalCourtPoseCell('court-artillery', 'hurt').row, 2);
assert.deepEqual(assets.tacticalDefenderMuzzleAnchor('musket', 'male'), {
  x: 17, y: 47, size: 'musket',
});
assert.deepEqual(assets.tacticalDefenderMuzzleAnchor('musket', 'female'), {
  x: 19, y: 47, size: 'musket',
});
assert.equal(assets.tacticalDefenderMuzzleAnchor('hornBow', 'male'), null);
assert.deepEqual(assets.tacticalCourtMuzzleAnchor('court-gunner'), {
  x: 50, y: 57, size: 'musket',
});
assert.deepEqual(assets.tacticalCourtMuzzleAnchor('court-artillery'), {
  x: 58, y: 72, size: 'cannon',
});

const screenSource = readFileSync(new URL('../../src/components/TacticalBattleScreen.tsx', import.meta.url), 'utf8');
const tacticalCss = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
assert.doesNotMatch(screenSource, /className="fx-muzzle-flash"/, 'zone-fixed musket flash must be removed');
assert.match(screenSource, /tactical-unit-muzzle-flash/, 'muzzle flash must be anchored inside each firing sprite');
assert.match(screenSource, /muzzleAnchor = firing && resolvedPose === 'attack'/,
  'attack poses must only show muzzle flash during a firing event');
assert.match(screenSource, /firing=\{recoiling\}/,
  'defender muzzle flash must follow the verified volley/recoil condition');
assert.match(screenSource, /function arrowProjectileCountForZone/,
  'projectile rendering needs a zone-aware arrow resolver');
assert.match(screenSource, /event\.shots\?\.arrows/,
  'arrow projectiles must come from the recorded arrow count, not the generic volley kind');
assert.match(screenSource, /hasArrowShooter/,
  'an arrow projectile needs a visible firing group in the event zone');
assert.match(screenSource, /group\.count - group\.killed > 0/,
  'an arrow projectile needs at least one surviving visible shooter');
assert.doesNotMatch(screenSource, /Array\.from\(\{ length: 5 \}/,
  'volley visuals must not create five unconditional arrows');
assert.doesNotMatch(tacticalCss, /\.tactical-zone\.event-volley \.tactical-raider-rank::after/,
  'generic volley CSS must not paint arrows in empty zones or musket-only volleys');
assert.match(screenSource, /moves-\$\{projectileMovesRight \? 'right' : 'left'\}/,
  'arrow direction must follow the firing side and battle orientation');
assert.match(screenSource, /event\.kind === 'wallAssault'[\s\S]*event\.groupId === group\.id/,
  'the wall-striking enemy group must use its attack pose');
assert.match(screenSource, /event\.kind === 'melee'[\s\S]*event\.side === 'raider'[\s\S]*event\.groupId/,
  'continuing rear assaults must animate only the attacking rear group');
assert.match(screenSource, /under-attack/,
  'an intact barricade must visibly react to enemy strikes');
assert.match(tacticalCss, /\.tactical-barricade\.under-attack/,
  'wall strike feedback needs a non-breaking barricade animation');
assert.match(screenSource, /weapon-\$\{group\.weapon \?\? 'unarmed'\}/,
  'defender sprites must expose their assigned weapon to visual sizing rules');
assert.match(screenSource, /role-\$\{group\.role\}/,
  'defender sprites must expose their role to visual sizing rules');
assert.match(tacticalCss, /\.tactical-defender\.role-watchman\s*\{\s*--defender-scale:\s*1\.08;/,
  'watchmen must be enlarged enough to match other human silhouettes');
assert.match(tacticalCss, /\.tactical-defender\.weapon-spear\s*\{\s*--defender-scale:\s*1\.12;/,
  'spear defenders must be enlarged enough to match other human silhouettes');
assert.match(tacticalCss, /\.tactical-court-raider\.unit-court-melee\s*\{\s*--raider-scale:\s*1\.26;/,
  'court melee troops must be enlarged enough to match other human silhouettes');
assert.match(tacticalCss, /tactical-assault-defender-fall[\s\S]*scaleX\(-1\) scale\(var\(--defender-scale/,
  'spear sizing must survive assault-side fall animation');

console.log('tactical sprite pose tests passed');
