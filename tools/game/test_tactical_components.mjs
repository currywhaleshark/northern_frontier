import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screenSource = readFileSync(new URL('../../src/components/TacticalBattleScreen.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const zoneSource = readFileSync(new URL('../../src/components/tactical/TacticalZoneColumn.tsx', import.meta.url), 'utf8');
const chipSource = readFileSync(new URL('../../src/components/tactical/TacticalGroupChip.tsx', import.meta.url), 'utf8');
const planSource = readFileSync(new URL('../../src/components/tactical/EnemyPlanPanel.tsx', import.meta.url), 'utf8');
const popoverSource = readFileSync(new URL('../../src/components/tactical/TacticalCommandPopover.tsx', import.meta.url), 'utf8');
const commandTextSource = readFileSync(new URL('../../src/components/tactical/commandText.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');

assert.match(screenSource, /<TacticalZoneColumn\b/, 'the battle screen must delegate each battlefield zone');
assert.match(screenSource, /<TacticalGroupChip\b/, 'the unit dock must delegate each group chip');
assert.match(screenSource, /<EnemyPlanPanel\b/, 'the preparation screen must delegate enemy plan intel');
assert.doesNotMatch(screenSource, /flankerIntel/, 'the legacy one-line flanker intel must be removed');
assert.match(screenSource, /enemyPlanCounterLabelsForAction/,
  'preparation cards must derive counter tags from revealed stratagems');
assert.match(screenSource, /const TACTICAL_PLAYBACK_NORMAL_SCALE = 1\.6;/,
  'normal tactical playback must run slower than the authored event timing');
assert.equal(
  [...screenSource.matchAll(/tacticalPlaybackDuration\(events\[index\]\.durationMs, fastRef\.current\)/g)].length,
  2,
  'preparation and combat playback must share the same pacing rule',
);
assert.doesNotMatch(screenSource, /Math\.min\((?:150|180), events\[index\]\.durationMs\)/,
  'fast-forward must preserve the previous normal event timing instead of skipping events');
const simulationPlaybackSource = screenSource.slice(
  screenSource.indexOf("battle.phase !== 'simulating'"),
  screenSource.indexOf('// The battle round and phase are the stable playback identity.'),
);
assert.match(simulationPlaybackSource, /applyTacticalPlaybackEvent\(battle, events\[index\]\)/,
  'combat playback must commit each movement event before starting the next event');
assert.match(screenSource, /fast \? ' fast-playback' : ''/,
  'the tactical screen must expose fast-forward state to visual effects');
assert.match(cssSource, /--tactical-playback-scale:\s*1\.6;/,
  'battlefield motion must use the same slower normal playback scale');
assert.equal(
  [...screenSource.matchAll(/<strong>\{activeEvent\?\.text \?\?/g)].length,
  0,
  'playback panels must not duplicate the active event caption already rendered on the battlefield',
);
assert.match(cssSource, /\.tactical-simulating\s*\{[\s\S]*grid-template-columns:\s*34px 1fr auto;/,
  'playback panels must keep the three-column loader, progress, and fast-forward layout');
assert.match(cssSource,
  /\.tactical-controls > \.tactical-panel-heading\s*\{[\s\S]*position:\s*sticky;[\s\S]*top:\s*0;[\s\S]*z-index:\s*12;[\s\S]*background:\s*#202428;/,
  'scrolling tactical controls must keep an opaque actionable heading visible');
assert.match(cssSource, /\.tactical-controls button\s*\{\s*scroll-margin-top:\s*48px;\s*\}/,
  'keyboard focus must scroll buttons below the sticky tactical heading');
assert.match(cssSource, /\.tactical-screen\.fast-playback\s*\{\s*--tactical-playback-scale:\s*1;/,
  'fast-forward must restore authored animation timing');
assert.match(cssSource,
  /\.tactical-zone\.event-melee \.tactical-raider-group\.melee-attacker\s*\{\s*animation:\s*tactical-charge-right calc\(520ms \* var\(--tactical-playback-scale\)\)/,
  'melee motion must slow together with event pacing');

assert.match(planSource, /objectiveRevealed/, 'enemy plan panel must hide an unrevealed objective');
assert.match(planSource, /미확인 계책/, 'enemy plan panel must show the hidden stratagem count');
assert.match(planSource, /enemyStratagemCounterStrength/,
  'enemy plan panel must derive a continuous combined counter percentage');
assert.match(planSource, /완전 대응/, 'enemy plan panel must label only 100% counters as complete');
assert.match(planSource, /부분 대응.*%/, 'enemy plan panel must show partial counters as a percentage');
assert.match(planSource, /effectiveCounterStrengths/,
  'enemy plan panel must accept current engagement counter strengths instead of trusting a cached formation value');
assert.match(planSource, /진형 대응은 실제 급습 전선에서 계산됩니다/,
  'a revealed rear maneuver without a live engagement must explain that formation is dynamic');
assert.match(planSource, /후열 경비 반영/,
  'a live rear engagement counter must say that the current zone guard is reflected');
assert.match(screenSource, /tacticalRearManeuverEffectiveCounterStrengthForZone/,
  'the battle screen must derive the panel counter from an actually engaged rear-assault zone');
assert.match(screenSource, /effectiveCounterStrengths=/,
  'the battle screen must pass the current rear-engagement counter into the enemy plan panel');
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
assert.match(zoneSource, /onSelectGroup\(group\.id,/, 'battlefield groups must remain selectable');
assert.match(zoneSource, /onSelectTarget/,
  'revealed enemy groups must expose the selected friendly group target callback');
assert.match(popoverSource, /from ['"]\.\/commandText['"]/,
  'the command popover must reuse shared command labels and descriptions');
assert.match(commandTextSource, /export function commandLabel[\s\S]*export function commandDescription/,
  'the lower command bar and popover must share one command text source');
assert.match(popoverSource, /tacticalSupportedCommands\(battle\)[\s\S]*tacticalCommandUnavailableReason\(battle, group, command\) == null/,
  'the popover must show only supported commands that are currently available');
assert.doesNotMatch(popoverSource, /COMMAND_LABELS|const\s+commandDescription/,
  'the popover must not duplicate command strings');
assert.match(screenSource, /<div className="tactical-stage-shell" ref=\{stageShellRef\}/,
  'the stage shell must own the popover positioning reference');
assert.ok(screenSource.indexOf('<TacticalCommandPopover') > screenSource.indexOf('<div className="tactical-battlefield"'),
  'the command popover must render in the stage shell after the clipped battlefield');
assert.match(screenSource, /commandPopover && selectedGroupId !== commandPopover\.groupId[\s\S]*setCommandPopover\(null\)/,
  'selection changes close the popover only when the selected group actually differs');
assert.match(screenSource, /assignCommandTo\(popoverGroup\.id, command\)/,
  'popover commands must target their explicit group instead of a selected-group closure');
assert.match(screenSource, /popoverAnchorRef\.current\?\.focus\(\)/,
  'Escape closing must restore focus to the battlefield unit anchor');
assert.match(zoneSource, /onSelectGroup\(group\.id, event\.currentTarget\)/,
  'battlefield selection must pass its unit element as the popover anchor');
assert.match(zoneSource, /\.\.\.formationStackStyle\(stackIndex, lineGroups\.length\)[\s\S]*zIndex:\s*80/,
  'the selected battlefield group must paint above ordinary inline formation depths');
assert.match(cssSource, /\.tactical-command-popover[\s\S]*z-index:\s*90;/,
  'the command popover must paint above the selected unit');
assert.match(cssSource, /left:\s*calc\(50% \+ var\(--caret-shift, 0px\)\)/,
  'the command popover caret must consume the clamped anchor shift');
assert.match(cssSource, /\.tactical-field-group\.next-pending > span[\s\S]*tactical-next-pulse/,
  'the next automatically selected command group must receive a temporary pulse');
assert.match(cssSource, /@media \(max-width:\s*900px\)[\s\S]*\.tactical-command-popover/,
  'narrow screens must turn the popover into a bottom sheet');
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
assert.match(zoneSource, /const showFormationGuides = battle\.phase === 'deployment';/,
  'formation-line and contact-line guides must be limited to deployment');
assert.match(zoneSource, /\{showFormationGuides && <span className="tactical-formation-line-label">/,
  'formation-line labels must not render after deployment');
assert.match(zoneSource, /\{showFormationGuides && \(\s*<div className="tactical-contact-line"/,
  'the contact-line guide must not render after deployment');

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
assert.match(screenSource, /onSplitHuntGroup/, 'the hunt deployment UI must expose group splitting');
assert.match(screenSource, /onMergeHuntGroups/, 'the hunt deployment UI must expose detachment merging');
assert.match(screenSource, /onSetHuntPreparationZone/,
  'the hunt deployment UI must confirm bait and trap sectors separately');
assert.match(screenSource, /미끼 놓을 길목|함정 설치할 길목/,
  'reserved hunt preparations must expose explicit sector selectors');
assert.match(screenSource, /huntDeploymentUnavailableReason/,
  'hunt deployment cannot start while a reserved preparation has no sector');
assert.match(screenSource, /1명 분리/, 'the selected hunt group must offer a one-person detachment');
assert.match(screenSource, /반으로 나누기/, 'the selected hunt group must offer a half-group detachment');
assert.match(screenSource, /같은 조 합류/, 'compatible hunt detachments must offer merging');
assert.match(screenSource, /길목을 모두 막으려면 조를 나누십시오/,
  'undersized hunt deployment must explain why detachments matter');
assert.match(appSource, /splitHuntGroup/, 'App must route hunt split actions into game state');
assert.match(appSource, /mergeHuntGroups/, 'App must route hunt merge actions into game state');
assert.match(screenSource, /tactical-hunt-sector-movement/,
  'hunt command controls must allow moving an existing detachment between sectors');
assert.match(screenSource, /이동한 조는 이번 라운드 몰이 기여가 절반/,
  'hunt command controls must explain the movement penalty');
assert.match(commandTextSource, /반격 대기/, 'hunt ambush command must be relabeled as counter-wait');
assert.match(commandTextSource, /모든 전투조/, 'counter-wait guidance must not imply a hunter-only restriction');
assert.match(screenSource, /tacticalSupportedCommands\(battle\)\.map\(command =>/,
  'the command bar must render the game-layer supported command contract');
assert.doesNotMatch(screenSource, /COMMANDS\.filter\(/,
  'the command bar must not keep a separate battle-mode filter');
assert.match(chipSource, /`자동: \$\{commandText \?\? '추천 없음'\}`/,
  'recommended commands must be labeled as automatic actions that will execute');
assert.doesNotMatch(chipSource, /명령 대기 ·/,
  'group chips must not imply that recommended commands are idle');
assert.match(screenSource, /자동 명령 \$\{pendingCommandCount\}개 부대/,
  'the command header must use the same automatic-command terminology as group chips');
assert.match(screenSource,
  /setViewedZoneId\(battle\.currentZoneId\);\s*\}, \[battle\?\.currentZoneId, battle\?\.phase\]\);/,
  'entering the command phase must resynchronize the viewed zone with the current battle focus');
assert.match(screenSource, /!hunt && \(\s*<div className="tactical-line-toggle"/,
  'hunt deployment and command controls must hide formation-line toggles');
assert.match(zoneSource, /tactical-sector-blockade/,
  'each hunt sector must render its own blockade gauge');
assert.match(zoneSource, /sectorBlockade/,
  'hunt sector reconnaissance must read the current blockade value');
assert.match(zoneSource, /huntOpenSectorRounds/,
  'open-sector reconnaissance must expose how long a hole has remained open');
assert.match(zoneSource, /huntMovedRound/,
  'groups moved during the current hunt round must carry a visible drive penalty marker');
assert.match(zoneSource, /tactical-beast-trace/,
  'a hidden predator must remain represented by an uncertain trace instead of disappearing');
assert.match(cssSource, /\.tactical-sector-blockade/,
  'the sector blockade gauge must have dedicated visual styling');
assert.match(cssSource, /\.tactical-hunt-moved/,
  'the hunt movement penalty marker must have dedicated visual styling');

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
assert.match(zoneSource, /formation-view/,
  'every battlefield keeps the full formation layout while the viewport moves between zones');
assert.match(cssSource, /\.tactical-zone\.formation-view \.tactical-raider-rank[\s\S]*grid-template-columns:\s*repeat\(3,/,
  'enemy formations must keep three visual columns during zone movement');
assert.match(cssSource, /\.tactical-zone\.formation-view \.tactical-defender-rank[\s\S]*grid-template-columns:\s*repeat\(3,/,
  'friendly formations must keep three visual columns during zone movement');
assert.match(cssSource, /\.tactical-line-toggle\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,/,
  'formation toggles must lay out three buttons');
assert.match(zoneSource, /tacticalRaiderVisibleDuringPlayback/,
  'withdrawing raiders must use event-aware playback visibility');
assert.match(zoneSource, /function formationStackStyle/,
  'focused formation groups must receive deterministic depth offsets');
assert.match(zoneSource, /const center = \(groupCount - 1\) \/ 2;/,
  'groups sharing a line must spread symmetrically around the field center');
assert.match(zoneSource, /Math\.min\(112, 64 \+ Math\.max\(0, groupCount - 2\) \* 20\)/,
  'formation spacing must separate two and three groups more clearly without leaving the field');
assert.match(zoneSource, /zIndex:\s*60 - Math\.round\(distanceFromCenter \* 10\) \+ index/,
  'lower formation groups must paint above groups placed farther back');
assert.match(zoneSource, /--formation-stack-y/,
  'formation depth must use a shallow vertical offset instead of full-height stacking');
assert.match(zoneSource, /formationGroupCount=\{lineGroups\.length\}/,
  'one, two, or three friendly groups must compact according to their own shared line only');
assert.doesNotMatch(zoneSource, /formationGroupCount=\{defenders\.length/,
  'three groups split across separate lines must not compact one another');
assert.match(zoneSource, /compactFormation=\{rearAssaulters\.length > 0\}/,
  'rear assault width pressure must remain separate from the same-line group count');
assert.match(zoneSource, /formationGroupCount >= 3[\s\S]*formationGroupCount >= 2/,
  'friendly formations must use distinct compact tiers for three and two same-line groups');
assert.match(zoneSource, /className=\{`tactical-field-group[\s\S]*data-stack-count=\{lineGroups\.length\}/,
  'same-line groups must expose their crowding count for label collision handling');
assert.match(cssSource, /data-stack-count="[23]"[\s\S]*data-stack-index="1"[\s\S]*translate:\s*0 10px/,
  'the middle label in a crowded friendly line must be vertically staggered');
assert.match(cssSource, /data-stack-count="[23]"[\s\S]*\.selected > span[\s\S]*max-width:\s*none;[\s\S]*overflow:\s*visible/,
  'selected crowded groups must restore the complete readable label');
assert.match(cssSource, /\.tactical-zone\.formation-view \.tactical-formation-lane[\s\S]*display:\s*grid;/,
  'groups sharing a formation line must overlap in one grid cell during viewport movement');
assert.match(cssSource,
  /\.tactical-zone\.formation-view \.tactical-formation-lane > \.tactical-raider-group,[\s\S]*grid-area:\s*1\s*\/\s*1;/,
  'each group in one line must occupy the same battlefield footprint');
assert.match(cssSource, /translate:\s*var\(--formation-stack-x[\s\S]*--formation-stack-y/,
  'overlapping groups must be staggered only by small ground-plane offsets');
assert.match(zoneSource, /function meleeActorForEvent/,
  'melee motion must resolve the attacking groups recorded by the event');
assert.match(zoneSource, /melee-attacker/,
  'only melee actors must receive the charge animation class');
assert.doesNotMatch(cssSource, /\.tactical-zone\.event-melee \.tactical-raider-rank\s*\{/,
  'melee must not move the entire enemy rank');
assert.doesNotMatch(cssSource, /\.tactical-zone\.event-melee \.tactical-defender-rank\s*[,\{]/,
  'melee must not move the entire friendly rank');
assert.match(cssSource, /\.tactical-zone\.event-melee \.tactical-raider-group\.melee-attacker/,
  'the attacking enemy group must move independently');
assert.match(cssSource, /\.tactical-zone\.event-melee \.tactical-field-group\.melee-attacker/,
  'the attacking friendly group must move independently');
assert.match(zoneSource, /casualty-hit/,
  'only the group named by a casualty event must receive the hit flash class');
assert.doesNotMatch(cssSource, /\.tactical-zone\.event-casualty \.tactical-defender-rank/,
  'casualty playback must not flash the entire friendly rank');
assert.match(cssSource, /\.tactical-zone\.event-casualty \.tactical-raider-group\.casualty-hit/,
  'enemy hit flashes must target only the damaged enemy group');
assert.match(cssSource, /\.tactical-zone\.event-casualty \.tactical-field-group\.casualty-hit/,
  'friendly hit flashes must target only the damaged friendly group');
assert.match(zoneSource, /rear-withdrawing/,
  'a rear assaulter must animate its exit before disappearing');
assert.match(zoneSource, /rear-facing/,
  'defenders assigned to a rear engagement must expose a facing class');
assert.match(cssSource, /\.tactical-field-group\.rear-facing \.tactical-defender[\s\S]*scaleX\(-1\)/,
  'rear-engagement defenders must turn around in defensive battles');
assert.match(cssSource, /\.tactical-screen\.assault \.tactical-field-group\.rear-facing \.tactical-defender[\s\S]*scaleX\(1\)/,
  'rear-engagement facing must reverse relative to offensive battle orientation');
assert.match(cssSource, /\.tactical-rear-assault-rank\s*\{[\s\S]*left:\s*86%;[\s\S]*right:\s*-2%;/,
  'rear assaulters must stand beyond the defender rear line');
assert.match(cssSource,
  /\.tactical-screen\.assault \.tactical-zone\.formation-view \.tactical-raider-rank \.line-front[\s\S]*grid-column:\s*1;/,
  'assault zones must put the enemy front line next to the reversed contact line');
assert.match(cssSource,
  /\.tactical-screen\.assault \.tactical-zone\.formation-view \.tactical-defender-rank \.line-rear[\s\S]*grid-column:\s*1;/,
  'assault zones must put the player rear line at the outer left edge');

console.log('tactical component extraction tests passed');
