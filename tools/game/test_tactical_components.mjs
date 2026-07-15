import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screenSource = readFileSync(new URL('../../src/components/TacticalBattleScreen.tsx', import.meta.url), 'utf8');
const zoneSource = readFileSync(new URL('../../src/components/tactical/TacticalZoneColumn.tsx', import.meta.url), 'utf8');
const chipSource = readFileSync(new URL('../../src/components/tactical/TacticalGroupChip.tsx', import.meta.url), 'utf8');
const planSource = readFileSync(new URL('../../src/components/tactical/EnemyPlanPanel.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');

assert.match(screenSource, /<TacticalZoneColumn\b/, 'the battle screen must delegate each battlefield zone');
assert.match(screenSource, /<TacticalGroupChip\b/, 'the unit dock must delegate each group chip');
assert.match(screenSource, /<EnemyPlanPanel\b/, 'the preparation screen must delegate enemy plan intel');
assert.doesNotMatch(screenSource, /flankerIntel/, 'the legacy one-line flanker intel must be removed');
assert.match(screenSource, /enemyPlanCounterLabelsForAction/,
  'preparation cards must derive counter tags from revealed stratagems');

assert.match(planSource, /objectiveRevealed/, 'enemy plan panel must hide an unrevealed objective');
assert.match(planSource, /미확인 계책/, 'enemy plan panel must show the hidden stratagem count');
assert.match(planSource, /enemyStratagemCounterStrength/,
  'enemy plan panel must derive a continuous combined counter percentage');
assert.match(planSource, /완전 대응/, 'enemy plan panel must label only 100% counters as complete');
assert.match(planSource, /부분 대응.*%/, 'enemy plan panel must show partial counters as a percentage');
assert.match(screenSource, /산채 교리:.*미확인/, 'expired lair intel must render doctrine as unidentified');
assert.match(screenSource, /이전 정찰 정보가 오래되었습니다/, 'expired lair intel must warn that prior scouting is stale');
assert.match(screenSource, /계책점수/, 'revealed lair doctrine summary must include its stratagem score');

for (const className of [
  'tactical-zone-heading',
  'tactical-raider-rank',
  'tactical-rear-assault-rank',
  'tactical-defender-rank',
  'tactical-barricade',
]) {
  assert.match(zoneSource, new RegExp(className), `zone extraction must preserve .${className}`);
}
assert.match(zoneSource, /data-zone-id=\{zone\.id\}/, 'zone identity must remain on the extracted section');
assert.match(zoneSource, /onSelectGroup\(group\.id\)/, 'battlefield groups must remain selectable');
assert.match(zoneSource, /onSelectTarget/,
  'revealed enemy groups must expose the selected friendly group target callback');
assert.match(zoneSource, /focus-target/,
  'the selected enemy group must have a persistent focus-target marker');
assert.match(zoneSource, /tacticalGroupTargetUnavailableReason/,
  'enemy target controls must validate reach for the currently selected friendly group');
assert.match(zoneSource, /selectedGroupId/,
  'enemy target controls must be scoped to the currently selected friendly group');
assert.match(zoneSource, /target-unavailable/,
  'enemy groups outside every friendly weapon reach must render disabled');
assert.match(zoneSource, /\['front', 'middle', 'rear'\]/,
  'focused battlefields must render all three defender formation lines');
assert.match(zoneSource, /\['rear', 'middle', 'front'\]/,
  'focused battlefields must render enemy lines from rear to contact');
assert.match(zoneSource, /raider\.line/,
  'enemy groups must render from their persisted tactical formation line');
assert.match(zoneSource, /tactical-formation-lane/,
  'focused zones must stack groups inside formation lanes');
assert.match(zoneSource, /tactical-contact-line/,
  'the seven-column formation view must mark the contact line');

assert.match(chipSource, /tactical-dock-chip/, 'group chip class contract must be preserved');
assert.match(chipSource, /disabled=\{active === 0\}/, 'routed group chips must remain disabled');
assert.match(chipSource, /tactical-dock-command/, 'command status must remain inside each chip');
assert.match(chipSource, /group\.line === 'middle' \? '중열'/,
  'group chips must distinguish the middle line');
assert.match(chipSource, /표적:/, 'group chips must show their own target state');
assert.match(chipSource, /자동/, 'automatic target state must be explicit');
assert.match(screenSource, /자동 표적/, 'the command panel must provide an explicit automatic-target button');
assert.match(screenSource, /onSetGroupTarget/, 'the screen must update one friendly group target at a time');
assert.doesNotMatch(screenSource, /focusTargetGroupId/, 'the current UI must not use the legacy zone focus target');

const threeLineToggleCount = [...screenSource.matchAll(/\['front', 'middle', 'rear'\] as const/g)].length;
assert.equal(threeLineToggleCount, 2, 'deployment and command controls must both expose three formation lines');
assert.match(screenSource, /line === 'middle' \? '중열'/,
  'formation controls must label the middle line');
assert.match(screenSource, /tacticalRearResponseOptions/,
  'the command panel must derive the available rear-assault response combinations');
assert.match(screenSource, /tactical-rear-response-guide/,
  'the command panel must expose rear-assault response tradeoffs');
assert.match(cssSource, /\.tactical-rear-response-guide/,
  'rear-assault response guidance must remain readable inside the command panel');
assert.match(cssSource, /\.tactical-zone\.focused \.tactical-raider-rank[\s\S]*grid-template-columns:\s*repeat\(3,/,
  'focused enemy formations must receive three visual columns');
assert.match(cssSource, /\.tactical-zone\.focused \.tactical-defender-rank[\s\S]*grid-template-columns:\s*repeat\(3,/,
  'focused defender formations must receive three visual columns');
assert.match(cssSource, /\.tactical-line-toggle\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,/,
  'formation toggles must lay out three buttons');
assert.match(cssSource, /\.tactical-formation-lane\s*\{\s*display:\s*contents;/,
  'non-focused zones must keep the compact rank layout');
assert.match(cssSource, /\.tactical-zone\.focused \.tactical-formation-lane[\s\S]*flex-direction:\s*column-reverse;/,
  'groups sharing a focused formation line must stack vertically from the battlefield floor');
assert.match(cssSource,
  /\.tactical-screen\.assault \.tactical-zone\.focused \.tactical-raider-rank \.line-front[\s\S]*grid-column:\s*1;/,
  'assault zones must put the enemy front line next to the reversed contact line');
assert.match(cssSource,
  /\.tactical-screen\.assault \.tactical-zone\.focused \.tactical-defender-rank \.line-rear[\s\S]*grid-column:\s*1;/,
  'assault zones must put the player rear line at the outer left edge');

console.log('tactical component extraction tests passed');
