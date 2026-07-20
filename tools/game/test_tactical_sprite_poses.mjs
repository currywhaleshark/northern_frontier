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

assert.equal(assets.TACTICAL_DEFENDER_DEFAULT_WEAPON_POSE_SHEET.src,
  '/assets/tactical/defender-default-weapons-poses-v1.png');
assert.equal(assets.TACTICAL_HEALER_POSE_SHEET.src,
  '/assets/tactical/defender-healers-poses-v1.png');
assert.equal(assets.TACTICAL_SPECIAL_RESIDENT_POSE_SHEET.src,
  '/assets/tactical/special-resident-combat-poses-v1.png');
assert.equal(assets.TACTICAL_MOUNTED_DEFENDER_POSE_SHEET.src,
  '/assets/tactical/defender-mounted-poses-v1.png');
assert.equal(assets.TACTICAL_NIMACHA_UNIT_POSE_SHEET.src,
  '/assets/tactical/nimacha-unit-poses-v1.png');
assert.equal(assets.TACTICAL_HOLAON_UNIT_POSE_SHEET.src,
  '/assets/tactical/holaon-unit-poses-v1.png');
assert.equal(assets.TACTICAL_BANDIT_UNIT_POSE_SHEET.src,
  '/assets/tactical/bandit-unit-poses-v1.png');
assert.equal(assets.TACTICAL_COURT_EXPANDED_POSE_SHEET.src,
  '/assets/tactical/court-expanded-poses-v1.png');
assert.equal(assets.tacticalDefaultWeaponPose({ id: 'militia-unarmed', role: 'militia', weapon: null }),
  'bambooSpear');
assert.equal(assets.tacticalDefaultWeaponPose({ id: 'militia-unarmed-levy', role: 'militia', weapon: null }),
  'farmTools');
assert.equal(assets.tacticalDefaultWeaponPose({ id: 'militia-unarmed-mustered', role: 'militia', weapon: null }),
  'farmTools');
assert.equal(assets.tacticalDefaultWeaponPose({ id: 'watchman-unarmed', role: 'watchman', weapon: null }),
  'watchmanBaton');
assert.equal(assets.tacticalDefaultWeaponPose({ id: 'hunter-unarmed', role: 'hunter', weapon: null }), null);
assert.equal(assets.tacticalDefaultWeaponPose({ id: 'militia-spear', role: 'militia', weapon: 'spear' }), null);

assert.deepEqual(assets.tacticalDefenderPoseCell('watchman', null, 'male', 'attack', 'watchmanBaton'), {
  sheet: 'defaultWeapons', column: 4, row: 1,
});
assert.deepEqual(assets.tacticalDefenderPoseCell('militia', null, 'female', 'idle', 'bambooSpear'), {
  sheet: 'defaultWeapons', column: 1, row: 0,
});
assert.deepEqual(assets.tacticalDefenderPoseCell('militia', null, 'male', 'wounded', 'farmTools'), {
  sheet: 'defaultWeapons', column: 2, row: 3,
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
assert.deepEqual(assets.tacticalDefenderPoseCell('healer', null, 'male', 'attack'), {
  sheet: 'healers', column: 0, row: 1,
});
assert.deepEqual(assets.tacticalDefenderPoseCell('healer', null, 'female', 'idle'), {
  sheet: 'healers', column: 1, row: 0,
});
assert.deepEqual(assets.tacticalDefenderPoseCell('militia', 'spear', 'male', 'attack', null, 'jurchenWarrior'), {
  sheet: 'specialResidents', column: 0, row: 1,
});
assert.deepEqual(assets.tacticalDefenderPoseCell('hunter', null, 'male', 'idle', null, 'tigerHunter'), {
  sheet: 'specialResidents', column: 1, row: 0,
});
assert.deepEqual(assets.tacticalDefenderPoseCell('healer', null, 'female', 'wounded', null, 'uinyeo'), {
  sheet: 'specialResidents', column: 2, row: 3,
});
assert.deepEqual(assets.tacticalDefenderPoseCell('militia', 'musket', 'male', 'hurt', null, 'hangwae'), {
  sheet: 'specialResidents', column: 3, row: 2,
});
assert.deepEqual(assets.tacticalDefenderPoseCell('militia', 'hornBow', 'male', 'idle', null, 'jurchenWarrior'), {
  sheet: 'weapons', column: 2, row: 0,
});
assert.deepEqual(assets.tacticalMountedDefenderPoseCell('militia', null, 'male', 'idle', 'bambooSpear'), {
  column: 0, row: 0,
});
assert.deepEqual(assets.tacticalMountedDefenderPoseCell('watchman', null, 'female', 'attack', 'watchmanBaton'), {
  column: 3, row: 1,
});
assert.deepEqual(assets.tacticalMountedDefenderPoseCell('hunter', null, 'male', 'hurt'), {
  column: 4, row: 2,
});
assert.deepEqual(assets.tacticalMountedDefenderPoseCell('militia', 'spear', 'female', 'wounded'), {
  column: 7, row: 3,
});
assert.deepEqual(assets.tacticalMountedDefenderPoseCell('hunter', 'hornBow', 'male', 'attack'), {
  column: 8, row: 1,
});
assert.deepEqual(assets.tacticalMountedDefenderPoseCell('militia', 'musket', 'female', 'idle'), {
  column: 11, row: 0,
});
assert.deepEqual(assets.tacticalMountedDefenderPoseCell('militia', 'spear', 'male', 'attack', null, 'jurchenWarrior'), {
  column: 12, row: 1,
});
assert.deepEqual(assets.tacticalMountedDefenderPoseCell('hunter', null, 'male', 'attack', null, 'tigerHunter'), {
  column: 13, row: 1,
});
assert.deepEqual(assets.tacticalMountedDefenderPoseCell('healer', null, 'female', 'attack', null, 'uinyeo'), {
  column: 14, row: 1,
});
assert.deepEqual(assets.tacticalMountedDefenderPoseCell('militia', 'musket', 'male', 'wounded', null, 'hangwae'), {
  column: 15, row: 3,
});
assert.deepEqual(assets.tacticalExpandedRaiderPoseCell('니마차 우디캐', 'nimacha-spearman', 'attack'), {
  sheet: 'nimachaUnits', column: 1, row: 1,
});
assert.deepEqual(assets.tacticalExpandedRaiderPoseCell('니마차 우디캐', 'shield-infantry', 'hurt'), {
  sheet: 'nimachaUnits', column: 3, row: 2,
});
assert.deepEqual(assets.tacticalExpandedRaiderPoseCell('홀라온 야인', 'holaon-horse-archer', 'idle'), {
  sheet: 'holaonUnits', column: 1, row: 0,
});
assert.deepEqual(assets.tacticalExpandedRaiderPoseCell('변경 마적', 'deserter-musketeer', 'attack'), {
  sheet: 'banditUnits', column: 4, row: 1,
});
assert.deepEqual(assets.tacticalExpandedRaiderPoseCell('변경 마적', 'wall-breaker', 'wounded'), {
  sheet: 'banditUnits', column: 5, row: 3,
});
assert.deepEqual(assets.tacticalExpandedRaiderPoseCell('조정 토벌군', 'court-shield', 'idle'), {
  sheet: 'courtExpanded', column: 0, row: 0,
});
assert.deepEqual(assets.tacticalExpandedRaiderPoseCell('조정 토벌군', 'court-horse-archer', 'attack'), {
  sheet: 'courtExpanded', column: 1, row: 1,
});
assert.deepEqual(assets.tacticalExpandedRaiderPoseCell('조정 토벌군', 'wall-breaker', 'hurt'), {
  sheet: 'courtExpanded', column: 2, row: 2,
});
assert.equal(assets.tacticalRaiderPoseCell('변경 마적', 'attack')?.row, 1);
assert.equal(assets.tacticalCourtPoseCell('court-artillery', 'hurt').column, 4);
assert.equal(assets.tacticalCourtPoseCell('court-artillery', 'hurt').row, 2);
assert.deepEqual(assets.tacticalCourtSupportPoseCell('court-medic', 'idle'), { column: 0, row: 0 });
assert.deepEqual(assets.tacticalCourtSupportPoseCell('court-hwacha', 'attack'), { column: 1, row: 1 });
assert.equal(assets.tacticalCourtSupportPoseCell('court-gunner', 'idle'), null);
assert.deepEqual(assets.tacticalDefenderMuzzleAnchor('musket', 'male'), {
  x: 17, y: 47, size: 'musket',
});
assert.deepEqual(assets.tacticalDefenderMuzzleAnchor('musket', 'female'), {
  x: 19, y: 47, size: 'musket',
});
assert.deepEqual(assets.tacticalDefenderMuzzleAnchor('musket', 'male', 'hangwae'), {
  x: 4, y: 60, size: 'musket',
});
assert.equal(assets.tacticalDefenderMuzzleAnchor('hornBow', 'male'), null);
assert.deepEqual(assets.tacticalCourtMuzzleAnchor('court-gunner'), {
  x: 50, y: 57, size: 'musket',
});
assert.deepEqual(assets.tacticalCourtMuzzleAnchor('court-artillery'), {
  x: 58, y: 72, size: 'cannon',
});
assert.deepEqual(assets.tacticalCourtMuzzleAnchor('court-hwacha'), {
  x: 34, y: 64, size: 'cannon',
});

const screenSource = [
  readFileSync(new URL('../../src/components/TacticalBattleScreen.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('../../src/components/tactical/TacticalZoneColumn.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('../../src/components/tactical/TacticalGroupChip.tsx', import.meta.url), 'utf8'),
].join('\n');
const tacticalCss = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
assert.doesNotMatch(screenSource, /className="fx-muzzle-flash"/, 'zone-fixed musket flash must be removed');
assert.match(screenSource, /tactical-unit-muzzle-flash/, 'muzzle flash must be anchored inside each firing sprite');
assert.match(screenSource, /muzzleAnchor = firing && resolvedPose === 'attack'/,
  'attack poses must only show muzzle flash during a firing event');
assert.match(screenSource, /tacticalDefenderMuzzleAnchor\(group\.weapon, gender, special\)/,
  'each special-resident slot needs its own verified muzzle anchor without affecting mixed-group peers');
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
assert.match(screenSource, /activeEvent\?\.direction === 'rear'[\s\S]*!frontalProjectileMovesRight/,
  'rear-engagement arrows must reverse the normal frontal projectile direction');
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
assert.match(screenSource, /tacticalDefaultWeaponPose\(group\)/,
  'defender rendering must resolve role-specific default weapons from the live group');
assert.match(screenSource, /event\.kind === 'report'[\s\S]*group\.kind === 'healer'[\s\S]*return 'attack'/,
  'a healer treatment report must use the dedicated treatment action pose');
assert.match(screenSource, /TACTICAL_DEFENDER_DEFAULT_WEAPON_POSE_SHEET/,
  'defender rendering must use the dedicated default weapon pose sheet');
assert.match(screenSource, /group\.mount === 'horse'/,
  'mounted defender groups select the horse sprite');
assert.match(screenSource, /tacticalMountedDefenderPoseCell/,
  'mounted defenders select a live weapon and pose cell instead of the legacy static horse portrait');
assert.match(screenSource, /TACTICAL_MOUNTED_DEFENDER_POSE_SHEET/,
  'mounted defenders use the dedicated combat pose sheet in both stage and dock rendering');
assert.match(screenSource, /tacticalExpandedRaiderPoseCell/,
  'expanded enemy unit types use faction-specific silhouettes instead of one faction portrait');
// 머리 크기 기준 정규화: 셀별 배율은 생성된 메트릭이 공급하고, CSS는 --unit-scale/--unit-dy를 반영해야 한다.
assert.match(screenSource, /tacticalSpriteMetricVars\('court'/,
  'court sprites must apply generated head-size metrics');
assert.match(screenSource, /tacticalSpriteMetricVars\('raiders'/,
  'raider sprites must apply generated head-size metrics');
assert.match(screenSource, /tacticalSpriteMetricVars\(metricSheet/,
  'defender sprites must apply generated head-size metrics');
assert.ok(tacticalCss.includes(
  'transform: translateY(var(--unit-dy, 0px)) scale(calc(var(--defender-scale) * var(--unit-scale, 1)))',
), 'defender transform must honor head-size normalization variables');
assert.match(tacticalCss, /tactical-assault-defender-fall[\s\S]*scaleX\(-1\) scale\(calc\(var\(--defender-scale, 1\) \* var\(--unit-scale, 1\)\)/,
  'head-size scaling must survive assault-side fall animation');

const metricsSource = readFileSync(new URL('../../src/render/tacticalSpriteMetrics.ts', import.meta.url), 'utf8');
const metricsOutput = ts.transpileModule(metricsSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const metricsPath = join(outDir, 'tacticalSpriteMetrics.mjs');
writeFileSync(metricsPath, metricsOutput, 'utf8');
const metrics = await import(pathToFileURL(metricsPath).href);
const expectedMetricShapes = {
  defenderRoles: { rows: 4, columns: 8 },
  defenderWeapons: { rows: 4, columns: 6 },
  defenderDefaultWeapons: { rows: 4, columns: 6 },
  healers: { rows: 4, columns: 2 },
  specialResidents: { rows: 4, columns: 4 },
  mountedDefenders: { rows: 4, columns: 16 },
  raiders: { rows: 4, columns: 6 },
  court: { rows: 4, columns: 5 },
  nimachaUnits: { rows: 4, columns: 5 },
  holaonUnits: { rows: 4, columns: 3 },
  banditUnits: { rows: 4, columns: 6 },
  courtExpanded: { rows: 4, columns: 3 },
};
for (const [sheetKey, shape] of Object.entries(expectedMetricShapes)) {
  const sheetMetrics = metrics.TACTICAL_SPRITE_METRICS[sheetKey];
  assert.equal(sheetMetrics.length, shape.rows, `${sheetKey} metric rows`);
  for (const rowMetrics of sheetMetrics) {
    assert.equal(rowMetrics.length, shape.columns, `${sheetKey} metric columns`);
    for (const metric of rowMetrics) {
      // 생성 스크립트의 SCALE_CLAMP(0.72~1.9)와 일치해야 한다.
      assert.ok(metric.scale >= 0.72 && metric.scale <= 1.9, `${sheetKey} scale in range: ${metric.scale}`);
      assert.ok(metric.dy >= -6 && metric.dy <= 60, `${sheetKey} dy in range: ${metric.dy}`);
    }
  }
}
assert.deepEqual(metrics.tacticalSpriteMetricVars('defenderRoles', 0, 0), {
  '--unit-scale': String(metrics.TACTICAL_SPRITE_METRICS.defenderRoles[0][0].scale),
  '--unit-dy': `${metrics.TACTICAL_SPRITE_METRICS.defenderRoles[0][0].dy}px`,
});

console.log('tactical sprite pose tests passed');
