import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screenSource = readFileSync(new URL('../../src/components/TacticalBattleScreen.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const zoneSource = readFileSync(new URL('../../src/components/tactical/TacticalZoneColumn.tsx', import.meta.url), 'utf8');
const chipSource = readFileSync(new URL('../../src/components/tactical/TacticalGroupChip.tsx', import.meta.url), 'utf8');
const planSource = readFileSync(new URL('../../src/components/tactical/EnemyPlanPanel.tsx', import.meta.url), 'utf8');
const popoverSource = readFileSync(new URL('../../src/components/tactical/TacticalCommandPopover.tsx', import.meta.url), 'utf8');
const minimapSource = readFileSync(new URL('../../src/components/tactical/TacticalMiniMap.tsx', import.meta.url), 'utf8');
const commandTextSource = readFileSync(new URL('../../src/components/tactical/commandText.ts', import.meta.url), 'utf8');
const commandPresentationSource = readFileSync(
  new URL('../../src/components/tactical/commandPresentation.ts', import.meta.url),
  'utf8',
);
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
assert.match(cssSource,
  /\.tactical-screen\s*\{[\s\S]*--tactical-controls-height:\s*min\(34vh,\s*250px\);[\s\S]*grid-template-rows:\s*auto minmax\(300px,\s*1fr\) var\(--tactical-controls-height\);/,
  'the battlefield grid must reserve one stable command-sized row for every lower battle phase');
assert.match(cssSource,
  /\.tactical-controls\s*\{[\s\S]*height:\s*100%;[\s\S]*max-height:\s*none;/,
  'phase content must scroll inside the reserved lower row instead of resizing the battlefield');
assert.match(cssSource,
  /@media \(max-height:\s*650px\)[\s\S]*--tactical-controls-height:\s*190px;/,
  'short viewports must keep a stable compact lower row');
assert.match(cssSource, /\.tactical-screen\.fast-playback\s*\{\s*--tactical-playback-scale:\s*1;/,
  'fast-forward must restore authored animation timing');
assert.match(cssSource,
  /\.tactical-zone\.event-melee \.tactical-raider-group\.melee-attacker\s*\{\s*animation:\s*tactical-charge-right calc\(520ms \* var\(--tactical-playback-scale\)\)/,
  'melee motion must slow together with event pacing');

assert.match(planSource, /objectiveRevealed/, 'enemy plan panel must hide an unrevealed objective');
assert.match(planSource, /미확인 계책/, 'enemy plan panel must show the hidden stratagem count');
assert.match(planSource, /EnemyPlanSummaryView/,
  'enemy plan panel must consume the backend summary selector instead of re-deriving reveal state');
assert.match(planSource, /tactical-enemy-summary-line/,
  'enemy plan panel must render the one-line objective/doctrine/composition summary');
assert.match(planSource, /doctrine\.(strength|weakness)/,
  'a revealed doctrine must show its strength and weakness in the same terms as the resolver');
assert.match(planSource, /권장 대응/, 'a revealed doctrine must surface the recommended counter');
assert.match(planSource, /범주 추정/,
  'unidentified composition groups must show only their intel category, not exact names');
assert.match(screenSource, /enemyPlanSummaryView\(battle\)/,
  'the battle screen must compute the enemy summary through the backend selector');
const simSetupSource = readFileSync(new URL('../../src/components/BattleSimulationSetup.tsx', import.meta.url), 'utf8');
assert.match(simSetupSource, /eligibleEnemyDoctrines\(/,
  'the simulator must list forceable doctrines from the backend eligibility rule');
assert.match(simSetupSource, /tacticalCompositionTemplates\(\)/,
  'the simulator must list forceable composition templates from the backend registry');
assert.match(simSetupSource, /enemyFlankRoute/,
  'the simulator must expose the forced flank route option');
assert.match(simSetupSource, /enemyCompositionTemplateId:/,
  'the simulator must pass the forced composition template into the simulation options');
assert.match(simSetupSource, /template\.doctrines\.includes/,
  'forcing a doctrine must filter the template list to compatible compositions');
assert.match(simSetupSource, /template\.implementationPhase <= 8/,
  'the simulator must expose composition templates up to the active battle phase cap');

// ── Phase 2: 교리 행동 징후와 doctrineShift 재생 ──
assert.match(planSource, /intentSignals/,
  'enemy plan panel must render intent signals from the backend summary, not recompute them');
assert.match(planSource, /tactical-enemy-intent-signals/,
  'intent signals must render as their own list block');
assert.doesNotMatch(planSource, /aiState|TacticalAiState/,
  'the panel must not read raw AI state fields directly — signals come pre-translated');
assert.match(screenSource, /doctrineShift: 'raidDrum'/,
  'doctrineShift playback must have a sound cue');
assert.match(zoneSource, /doctrine-shifting/,
  'the acting raider group must get a doctrine-shift motion class');
assert.match(cssSource, /\.tactical-zone\.event-doctrineShift \.tactical-raider-group\.doctrine-shifting\s*\{\s*animation:\s*tactical-doctrine-shift calc\(560ms \* var\(--tactical-playback-scale\)\)/,
  'doctrine-shift motion must follow shared playback pacing');

// ── 무대 포인터 드래그 인프라 (P1.5 스파이크 → Phase 3/4 공유 경로) ──
const dragSource = readFileSync(new URL('../../src/components/tactical/stagePointerDrag.ts', import.meta.url), 'utf8');
assert.match(dragSource, /STAGE_DRAG_THRESHOLD_PX = 6/,
  'stage drag must keep a movement threshold so clicks stay clicks');
assert.match(dragSource, /setPointerCapture/, 'crossing the threshold must capture the pointer');
assert.match(dragSource, /try\s*\{\s*session\.element\.setPointerCapture/,
  'pointer capture must tolerate synthetic pointers without throwing');
assert.match(dragSource, /elementsFromPoint/,
  'anchor hit-testing must be coordinate based because capture pins the event target');
assert.match(dragSource, /key === 'Escape'/, 'Escape must cancel an active drag');
assert.match(dragSource, /contextmenu/, 'right-click must cancel an active drag');
assert.match(dragSource, /pointercancel|handlePointerCancel/,
  'native pointercancel (e.g. touch scroll takeover) must cancel the drag');
assert.match(dragSource, /event\.buttons === 0[\s\S]{0,120}cancelDrag\(\)/,
  'a buttons-up pointer move must clear a stale session so a fast flick cannot leave a hover-activated ghost drag');
assert.match(cssSource, /\.stage-drag-handle\s*\{[\s\S]*?touch-action:\s*none;/,
  'drag handles must opt out of native touch scrolling so the stage strip keeps its own');
assert.match(screenSource, /dragSpike/,
  'the drag spike harness must stay behind its dev-only URL flag');
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
assert.match(commandPresentationSource,
  /tacticalSupportedCommands\(battle\)\.filter\(command =>[\s\S]*tacticalCommandUnavailableReason\(battle, group, command\) == null/,
  'the presentation helper must show only supported commands that are currently available');
assert.match(popoverSource, /tacticalCommandPresentation\(battle, group\)/,
  'the popover must consume the isolated quick-command presentation helper');
assert.doesNotMatch(popoverSource, /COMMAND_LABELS|const\s+commandDescription/,
  'the popover must not duplicate command strings');
assert.match(popoverSource, /quickCommands\.map\(command => renderCommandButton\(command, 'quick'\)\)/,
  'the quick-action strip must render only the prioritized quick commands');
assert.match(popoverSource,
  /quickCommands\.map\(command => renderCommandButton\(command, 'quick'\)\)[\s\S]*className="tactical-command-more-toggle"[\s\S]*onClick=\{onOpenCommandBoard\}/,
  'the fixed final More slot must open the lower command board after the quick commands');
assert.doesNotMatch(popoverSource, /moreCommands|tactical-command-more-list/,
  'the quick-action strip must not nest the remaining command list');
assert.doesNotMatch(popoverSource,
  /commandSummary|표적:\s*자동|자동:\s*추천 대기|tactical-command-popover-description/,
  'the popover must omit automatic summaries, automatic target text, and persistent descriptions');
assert.doesNotMatch(popoverSource, /적 부대를 클릭하면 집중 표적|전체 명령은 아래 명령판에서/,
  'the compact popover must remove repetitive targeting and lower-panel instructions');
assert.match(popoverSource, /aria-label=\{`\$\{label\}: \$\{commandHelp\}`\}[\s\S]*title=\{`\$\{label\} — \$\{commandHelp\}`\}/,
  'command buttons must retain explicit accessible labels and tooltip descriptions');
assert.match(popoverSource, /function TacticalPlacementSegment\([\s\S]*<TacticalPlacementSegment/,
  'formation and hunt-route selection must remain an independently replaceable placement component');
assert.match(popoverSource,
  /function TacticalPlacementSegment\([\s\S]*useState\(false\)[\s\S]*aria-expanded=\{expanded\}[\s\S]*배치/,
  'placement controls must start collapsed behind an explicit toggle');
assert.match(popoverSource, /if \(!canMove\) return null;/,
  'placement controls must disappear when the group cannot move anywhere');
assert.match(popoverSource,
  /manualTargetLabel[\s\S]*targetSource === 'player'[\s\S]*targetGroupId[\s\S]*tactical-command-target-badge/,
  'only a persisted manual target may add a compact header badge');
assert.match(popoverSource, /event\.key !== 'Escape'[\s\S]*onClose\(true\)/,
  'Escape must continue closing the popover with focus restoration requested');
assert.match(popoverSource, /ArrowLeft[\s\S]*ArrowRight[\s\S]*ArrowUp[\s\S]*ArrowDown[\s\S]*\.focus\(\)/,
  'arrow keys must move focus between quick-action controls');
assert.match(popoverSource, /피난 주민은 보호 대상이며 전투 명령을 받지 않습니다/,
  'civilian groups must retain the description-only protection mode');
assert.match(popoverSource, /전술 치료반은 후열 보호 대상이며[\s\S]*자동 치료/,
  'healer groups must retain their distinct non-command explanation');
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
assert.match(screenSource,
  /const openCommandBoard = \(\)[\s\S]*setCommandPopover\(null\)[\s\S]*commandBoardRef\.current\?\.querySelector<HTMLButtonElement>\('button:not\(:disabled\)'\)\?\.focus\(\)/,
  'More must close the popover while preserving selection and focus the first enabled full command');
assert.match(screenSource, /onOpenCommandBoard=\{openCommandBoard\}/,
  'the popover More slot must route to the lower full command board');
assert.match(screenSource, /ref=\{commandBoardRef\}[\s\S]*command-board-emphasis/,
  'opening the full board must visibly emphasize the lower command path');
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
assert.match(minimapSource, /tacticalRaiderVisibleDuringPlayback/,
  'the tactical minimap must reuse the battlefield raider visibility contract');
assert.match(minimapSource, /from ['"]\.\/commandText['"]/,
  'the tactical minimap must reuse shared command labels');
assert.match(minimapSource, /tacticalRaiderIntentLabel/,
  'the tactical minimap must reuse the battlefield raider intent label');
assert.match(screenSource, /<TacticalMiniMap\b/,
  'the battle stage must render the tactical minimap');
assert.match(screenSource, /battle\.phase === 'preparation'[\s\S]*battle\.phase === 'deployment'/,
  'the tactical minimap must be available from the preparation phase');
assert.match(screenSource, /behavior:\s*battle\?\.assaultKind === 'predatorHunt' \? 'auto' : 'smooth'/,
  'hunt zone changes must switch instantly instead of implying a linear battlefield');
assert.doesNotMatch(screenSource, /tactical-stage-index/,
  'the tactical minimap must replace the legacy stage index');
assert.match(cssSource, /\.tactical-minimap\s*\{[\s\S]*z-index:\s*70;/,
  'the tactical minimap must paint above ordinary units and below selection and popovers');
assert.match(cssSource, /\.tactical-minimap\s*\{[\s\S]*top:\s*72px;/,
  'the tactical minimap must sit below the full-width zone heading');
assert.match(cssSource, /\.tactical-screen\.hunt \.tactical-minimap\s*\{\s*top:\s*80px;/,
  'the taller hunt heading and blockade gauge must have extra clearance');
assert.match(cssSource, /\.tactical-screen:not\(\.hunt\) \.tactical-zone > p[\s\S]*right:\s*256px;/,
  'strip minimaps must reserve horizontal space beside the zone description');
assert.match(cssSource, /\.tactical-screen\.hunt \.tactical-zone > p[\s\S]*right:\s*160px;/,
  'hunt minimaps must reserve horizontal space beside the zone description');
assert.match(cssSource, /\.tactical-screen\.hunt \.tactical-battlefield\s*\{[\s\S]*scroll-behavior:\s*auto;/,
  'hunt battlefields must disable the linear smooth-scroll transition');
assert.match(cssSource, /@media \(max-width:\s*900px\)[\s\S]*\.tactical-minimap\s*\{\s*display:\s*none;/,
  'the first minimap slice must stay hidden on narrow screens');
assert.match(minimapSource, /const RAIDER_FORMATION_LINES:[\s\S]*\['rear', 'middle', 'front'\]/,
  'the strip minimap must order enemy lines from rear to the contact line');
assert.match(minimapSource, /RAIDER_FORMATION_LINES\.map\(line =>[\s\S]*group\.line === line/,
  'the strip minimap must place enemy groups in their persisted formation line');
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
assert.match(screenSource, /tacticalFormationLineUnavailableReason\(battle, selectedGroup, line\)/,
  'formation controls must use the phase-aware game-layer movement contract');
assert.match(popoverSource, /tacticalFormationLineUnavailableReason\(battle, group, line\)/,
  'the command popover must share the phase-aware formation movement contract');
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

// ── Phase 3: 빈 전장 배치 카드 독 ──
const deployDockSource = readFileSync(
  new URL('../../src/components/tactical/TacticalDeploymentDock.tsx', import.meta.url),
  'utf8',
);

assert.match(screenSource, /battle\.phase === 'deployment'[\s\S]*?<TacticalDeploymentDock\b/,
  'the deployment phase must delegate reserve cards to the deployment dock');
assert.match(screenSource, /applyAutoDeployTacticalGroups\(activeBattle\)/,
  'the auto-deploy button must reuse the backend auto deployment mutation');
assert.match(screenSource, /resetTacticalDeployment\(activeBattle\)/,
  'the deployment reset button must reuse the backend reset mutation');
assert.match(screenSource, /배치 초기화/, 'the deployment screen must offer a reset-to-cards action');
assert.match(screenSource, /배치 완료/, 'deployment must complete through an explicit completion button');
assert.match(screenSource, /deploymentStartReason = hunt \? huntDeploymentReason : deploymentView\?\.unavailableReason/,
  'the completion gate must come from backend unavailable reasons, not recomputed counts');
assert.match(screenSource, /splitFeaturedTacticalGroup\(current, selectedGroup\.id, selectedFeatured\.residentId, featuredSplit\.companions\)/,
  'the named-resident split must call the featured split mutation with chosen companions');
assert.match(screenSource, /\{selectedFeatured\.shortName\}의 조 분리/,
  'the featured split action must be labeled <resident>의 조 분리, not a generic label');
assert.match(screenSource, /featuredSplit\.companions\.length >= 2/,
  'the companion picker must cap featured split companions at two');
assert.match(screenSource, /tacticalDeploymentPlacementUnavailableReason\(battle, selectedGroup\.id/,
  'deployment zone buttons must gate through the same placement validator as dragging');
assert.match(screenSource, /deploymentForced === 'nightAmbush' && battle\.round === 1/,
  'a successful night ambush must surface a forced-deployment notice in round one');
assert.match(screenSource, /splitSelectedGroup|onSplitHuntGroup/,
  'group splitting must remain reachable from the deployment controls');
assert.match(screenSource, /mergeTacticalGroups\(current, selectedGroup\.id, sourceGroupId\)/,
  'non-hunt merges must route through the shared merge mutation');

assert.match(deployDockSource, /useStagePointerDrag\(\{/,
  'deployment cards must reuse the shared stage pointer drag hook');
assert.match(deployDockSource, /data-deploy-anchor/,
  'deployment drags must resolve their targets through the deploy anchor attribute');
assert.match(deployDockSource, /tacticalDeploymentPlacementUnavailableReason\(battle, card\.groupId, target\)/,
  'card drops must validate through the backend placement reason before mutating');
assert.match(deployDockSource, /placeTacticalDeploymentGroup\(current, card\.groupId, target\)/,
  'valid card drops must apply immediately through the backend place mutation');
assert.match(deployDockSource, /removeTacticalDeploymentGroup\(current, card\.groupId\)/,
  'dragging a placed card back to the waiting area must return it to reserve');
assert.match(deployDockSource, /배치 대기/, 'the dock must render a waiting-card area');
assert.match(deployDockSource, /배치 완료/, 'the dock must render a placed-card area');
assert.match(deployDockSource, /militia-unarmed-mustered/,
  'the emergency militia card must be highlighted when deployment opens');
assert.match(deployDockSource, /피난 주민은 마을 중심지 최후열에 고정/,
  'civilian cards must be locked with an explanation instead of being draggable');
assert.match(deployDockSource, /defaultTacticalDeploymentPlacement\(battle, group\)/,
  'waiting cards must read the recommended line from the backend default placement');
assert.doesNotMatch(deployDockSource, /window\.confirm|TacticalOrderConfirm/,
  'deployment drops must apply immediately without a confirmation card (13.8)');

assert.match(zoneSource, /'data-deploy-anchor': deployAnchorId/,
  'defender formation lanes must expose deploy anchors during deployment');
assert.match(zoneSource, /tacticalDeploymentPlacementUnavailableReason\(battle, stageDrag\.groupId/,
  'lane anchor validity must come from the backend placement validator');
assert.match(zoneSource, /deploy-anchor-hover/,
  'the hovered valid lane must get a stronger highlight while dragging');
assert.match(zoneSource, /tactical-deploy-lane-ghost/,
  'hovering a valid lane must show a deployment ghost instead of the real unit');
assert.match(zoneSource, /'--featured-scale': featured\.spriteScale/,
  'featured resident scale must come from the backend spriteScale contract');
assert.match(zoneSource, /special=\{slotSpecial\(index\)\}/,
  'only the featured resident slot may use the special resident sprite sheet');
assert.match(zoneSource, /tactical-featured-mark/,
  'featured residents must carry an always-on small marker');
assert.match(zoneSource, /tactical-featured-name/,
  'featured residents must expose a hover/selection name tag');

assert.match(cssSource, /\.tactical-deploy-dock\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\);/,
  'the deployment dock must split into waiting and placed areas');
assert.match(cssSource, /\.tactical-formation-lane\.deploy-anchor-hover/,
  'the hovered deploy anchor lane must have dedicated styling');
assert.match(cssSource, /\.tactical-formation-slot\.featured\s*\{[\s\S]*scale\(var\(--featured-scale/,
  'featured slots must scale by the backend-provided ratio');
assert.doesNotMatch(cssSource, /\.tactical-formation-slot\.featured\s*\{[^}]*border/,
  'featured residents must not get an always-on border (plan 7.5)');
assert.match(cssSource, /\.tactical-field-group:hover \.tactical-featured-name/,
  'the featured name tag must appear on hover');
assert.match(cssSource, /prefers-reduced-motion[\s\S]*tactical-deploy-card\.just-mustered\s*\{\s*animation:\s*none;/,
  'the muster pulse must respect reduced-motion preferences');

// ── Phase 4: 무대 드래그·고스트·확인 카드 ──
const orderConfirmSource = readFileSync(
  new URL('../../src/components/tactical/TacticalOrderConfirm.tsx', import.meta.url),
  'utf8',
);
const orderPreviewSource = readFileSync(
  new URL('../../src/components/tactical/stageOrderPreview.ts', import.meta.url),
  'utf8',
);
const dragHookSource = readFileSync(
  new URL('../../src/components/tactical/stagePointerDrag.ts', import.meta.url),
  'utf8',
);

assert.match(screenSource, /<TacticalOrderConfirm\b/,
  'command-phase drops must confirm through the dedicated order confirm card');
assert.match(screenSource, /applyTacticalStageOrder\(current, preview\.groupId, preview\.destination\)/,
  'confirming a stage order must apply exactly the previewed backend mutation');
assert.match(screenSource, /tacticalStageOrderUnavailableReason\(battle, groupId, target\)/,
  'stage drops must gate through the backend stage-order validator');
assert.match(screenSource, /if \(preview\.command == null\) return; \/\/ 같은 위치 드롭 = 선택만 유지/,
  'same-position drops must only keep the selection without a confirm card');
assert.match(screenSource, /setStageOrderConfirm\(null\);\s*cancelStageDrag\(\);/,
  'entering playback must cancel unconfirmed drags and pending confirm cards');
assert.match(screenSource, /setStageOrderConfirm\(null\); \/\/ 무대 빈 곳 클릭 = 미확정 명령 취소/,
  'clicking empty stage space must cancel the pending confirm card');
assert.match(screenSource, /stageDropGuardRef/,
  'the click that follows a drop must not reopen the command popover');
assert.match(screenSource, /trackPosition: false/,
  'the screen-level stage drag hook must not re-render on every pointer move');
assert.doesNotMatch(screenSource, /powerPenalty\s*[*+\-/]/,
  'the screen must not recompute stage-order power penalties');

assert.match(orderConfirmSource, /role="dialog"/,
  'the order confirm card must be an accessible dialog');
assert.match(orderConfirmSource, /Escape/, 'Escape must cancel the pending order');
assert.match(orderConfirmSource, /contextmenu/, 'right-click must cancel the pending order');
assert.match(orderConfirmSource, /stopPropagation/,
  'clicks inside the confirm card must not bubble into the stage-shell cancel handler');
assert.match(orderConfirmSource, /취소/, 'the confirm card must offer an explicit cancel button');
assert.match(orderConfirmSource, /\{confirmLabel\}/,
  'the confirm button must name the command being confirmed');
assert.doesNotMatch(orderConfirmSource,
  /applyTacticalStageOrder|setTacticalCommand|setDefenderFormationLine|setTacticalGroupFacing/,
  'the confirm card must delegate mutations to its callbacks');
assert.match(screenSource, /confirmLabel: `\$\{stageOrderCommandLabel\(stageOrderConfirm\.preview\.command\)\} 확정`/,
  'stage-order confirms must name the previewed command on the confirm button');

assert.match(orderPreviewSource, /Math\.round\(preview\.powerPenalty \* 100\)/,
  'penalty text must come straight from the backend preview ratio');
assert.doesNotMatch(orderPreviewSource, /CONFIG|Multiplier/,
  'stage order presentation must not reach into config or multiplier math');

assert.match(zoneSource, /tacticalStageOrderUnavailableReason\(battle, stageDrag\.groupId/,
  'command-mode lane validity must come from the backend stage-order validator');
assert.match(zoneSource, /tacticalStageOrderPreview\(battle, ghostGroup\.id/,
  'the command-mode lane ghost must describe the previewed order');
assert.match(zoneSource, /stage-dragging/,
  'the dragged stage unit must show a dragging visual state');
assert.match(zoneSource, /showFormationGuides \? group\.kind !== 'civilian' : group\.commandable !== false/,
  'stage drag handles must exclude civilians in deployment and non-commandables in command');
assert.match(zoneSource, /showFormationGuides \|\| battle\.phase === 'command' \? \{ 'data-deploy-anchor': deployAnchorId \}/,
  'lanes must stay anchor targets during the command phase');

assert.match(dragHookSource, /trackPosition/,
  'the shared drag hook must support hover-only tracking for screen-level use');
assert.match(dragHookSource, /previous\.hoverAnchorId === hoverAnchorId\) return previous;/,
  'hover-only tracking must skip re-renders while the anchor is unchanged');

assert.match(cssSource, /\.tactical-order-confirm\s*\{[\s\S]*position:\s*absolute;/,
  'the confirm card must overlay the stage near the drop point');
assert.match(cssSource, /\.tactical-field-group\.stage-dragging\s*\{\s*opacity/,
  'the dragged unit must dim while its ghost previews the destination');

// ── Phase 5: 명시적 방향 ──
assert.match(zoneSource, /const rearFacing = group\.facing === 'towardRear';/,
  'stage flip direction must come from the explicit facing state, not line/command inference');
assert.match(zoneSource, /tactical-facing-arrow/,
  'the selected unit must show facing arrows on both sides');
assert.match(zoneSource, /assault \? 'towardRear' : 'towardEnemy'/,
  'screen left/right must derive from battle orientation instead of being stored');
assert.match(zoneSource, /facing-turning/,
  'a pending facing change must show a current-round penalty badge on the stage unit');
assert.doesNotMatch(zoneSource, /0\.75|25%/,
  'the stage must not hardcode the facing penalty ratio');
assert.match(screenSource, /setTacticalGroupFacing\(current, groupId, facing\)/,
  'deployment facing changes must apply immediately through the backend mutation');
assert.match(screenSource, /setTacticalGroupFacing\(current, preview\.groupId, preview\.destination\)/,
  'command facing confirms must apply exactly the previewed backend mutation');
assert.match(screenSource, /tacticalFacingPreview\(battle, groupId, facing\)/,
  'command facing changes must preview through the backend before confirming');
assert.match(screenSource, /facingPenaltyText\(stageOrderConfirm\.preview\)/,
  'the facing confirm card must show the backend-provided penalty');
assert.equal(
  [...screenSource.matchAll(/renderFacingToggle\(selectedGroup\)/g)].length,
  2,
  'deployment and command controls must both expose the keyboard facing toggle',
);
assert.match(screenSource, /기존 명령\(/,
  'the facing confirm card must state that the current command is preserved');
assert.doesNotMatch(orderPreviewSource, /0\.75/,
  'facing presentation must not hardcode the turn multiplier');
assert.match(chipSource, /pendingFacing \? ' · 회전 중' : ''/,
  'command dock chips must surface the current-round facing penalty');
assert.match(chipSource, /facing === 'towardRear' \? ' · 후방 경계' : ''/,
  'command dock chips must surface a rear-facing state');
assert.match(cssSource, /\.tactical-facing-arrow\.left/,
  'facing arrows must sit on both sides of the selected unit');

// ── Phase 6: 우회로 준비·미니맵 가지·무대 리본·징후 ──
const routeRibbonSource = readFileSync(
  new URL('../../src/components/tactical/TacticalRouteRibbon.tsx', import.meta.url),
  'utf8',
);

assert.match(screenSource, /toggleTacticalFlankRoutePreparation\(current, option\.side\)/,
  'route preparation must toggle per side through the backend mutation');
assert.match(screenSource, /action\.id !== 'openFlankRoute' \|\| flankRouteOptions\.length > 0/,
  'the flank route action card must hide in battles without flank routes');
assert.match(screenSource, /tacticalFlankRoutePreparationView\(state\)/,
  'route side options and refund state must come from the backend preparation view');
assert.match(screenSource, /tacticalFlankRouteView\(battle\)/,
  'route display state must come from the backend visibility selector');
assert.match(screenSource, /<TacticalRouteRibbon\b/,
  'the stage must delegate visible routes to the route ribbon');
assert.match(screenSource, /battle\.pendingReport\?\.routeAdvances/,
  'route movement replay must come from the round report contract');
assert.doesNotMatch(screenSource, /defenderIntel ===|routeTransit\.step/,
  'the screen must not re-derive route visibility or read raw transit steps');

assert.match(routeRibbonSource, /view\.display !== 'hidden'/,
  'hidden routes must never render in the ribbon');
assert.match(routeRibbonSource, /advance\.visibleToDefender/,
  'only visible route advances may replay in the ribbon');
assert.match(routeRibbonSource, /expectedArrivalRounds/,
  'suspected routes must show the backend arrival range only');
assert.doesNotMatch(routeRibbonSource, /routeTransit|defenderIntel/,
  'the ribbon must read the view contract, not raw route state');

assert.match(minimapSource, /MinimapRouteBranch/,
  'the strip minimap must render flank route branches');
assert.match(minimapSource, /!view \|\| view\.display === 'hidden'\) return null;/,
  'unopened routes must not appear on the minimap');
assert.match(minimapSource, /display-\$\{view\.display\}/,
  'suspected routes must render with the display-state styling class');
assert.match(minimapSource, /tactical-minimap-route-suspect">\?/,
  'suspected routes must show a question mark');
assert.match(minimapSource, /!tacticalGroupIsInRouteTransit\(group\)/,
  'transit groups must leave the zone dot lists');
assert.match(zoneSource, /!tacticalGroupIsInRouteTransit\(group\)/,
  'transit groups must leave the stage ranks');
assert.match(planSource, /routeViews/,
  'the enemy plan panel must surface route intel lines');
assert.match(cssSource, /\.tactical-minimap-route\.display-suspected \.tactical-minimap-route-line\s*\{\s*border-top-style:\s*dashed;/,
  'suspected minimap branches must be dashed');
assert.match(cssSource, /\.tactical-route-ribbon\s*\{[\s\S]*position:\s*absolute;/,
  'the route ribbon must overlay the stage edge');
assert.match(cssSource, /prefers-reduced-motion[\s\S]*\.tactical-route-advance\s*\{\s*animation:\s*none;/,
  'route advance pulses must respect reduced motion');

// ── Phase 7: 경로 차단 배치·우회 기동·교전/급습 재생 ──
const dockSourceP7 = deployDockSource === undefined ? '' : readFileSync(
  new URL('../../src/components/tactical/TacticalDeploymentDock.tsx', import.meta.url),
  'utf8',
);
const ribbonSourceP7 = readFileSync(
  new URL('../../src/components/tactical/TacticalRouteRibbon.tsx', import.meta.url),
  'utf8',
);

assert.match(ribbonSourceP7, /parseRouteAnchorId/,
  'route entrances must resolve through the shared route anchor helper');
assert.match(ribbonSourceP7, /deploymentPhase && view\.route\.openedByDefender/,
  'only player-opened routes may become blocker drop anchors during deployment');
assert.match(ribbonSourceP7, /tacticalRoutePlacementUnavailableReason\(battle, blockerDrag\.groupId, view\.route\.side\)/,
  'route anchor validity must come from the backend placement reason');
assert.match(ribbonSourceP7, /routeEngagements/,
  'route engagements must replay from the round report contract');
assert.match(ribbonSourceP7, /engagement\.lines\.join/,
  'engagement narration must come from backend lines, not be invented');
assert.match(ribbonSourceP7, /outcome-\$\{engagement\.outcome\}/,
  'engagement chips must style by the backend outcome');
assert.match(ribbonSourceP7, /routeArrivals/,
  'route exit arrivals must replay from the round report contract');
assert.doesNotMatch(ribbonSourceP7, /rearRaidPowerMultiplier|0\.75|1\.5/,
  'the ribbon must not hardcode raid or exposure multipliers');

assert.match(dockSourceP7, /placeTacticalRouteBlocker\(current, card\.groupId, routeSide\)/,
  'card drops on route anchors must call the backend blocker mutation');
assert.match(dockSourceP7, /tacticalRoutePlacementUnavailableReason\(battle, card\.groupId, routeSide\)/,
  'card route drops must pre-validate through the backend reason');
assert.match(dockSourceP7, /경로 차단/,
  'blocker cards must label their route placement');
assert.match(screenSource, /placeTacticalRouteBlocker\(current, groupId, routeSide\)/,
  'stage unit drops on route anchors must call the backend blocker mutation');
assert.match(screenSource, /routeEngagements={combatPlayback \? battle\.pendingReport\?\.routeEngagements \?\? null : null}/,
  'engagement replay must be limited to the combat playback window');
assert.match(screenSource, /rearRaid={group\.rearRaidRound === \(battle\.pendingReport\?\.round \?\? battle\.round\)}/,
  'dock chips must badge rear raids only on the displayed arrival round');
assert.match(zoneSource, /group\.rearRaidRound === \(battle\.pendingReport\?\.round \?\? battle\.round\)/,
  'stage units must badge rear raids only on the displayed arrival round');
assert.match(chipSource, /경로 차단.*우회 이동/,
  'transit chips must distinguish blocking from raiding');
assert.match(commandTextSource, /flankRoute: '우회 기동'/,
  'the flankRoute command must keep its label in the shared command text');
assert.match(cssSource, /\.tactical-route-ribbon-row\.deploy-anchor-hover/,
  'hovered route anchors must highlight during blocker drags');
assert.match(cssSource, /\.tactical-state-badge\.rear-raid/,
  'the rear raid badge must have dedicated styling');

// ── Phase 8: 지원·화포 병과 표시와 연출 ──
assert.match(zoneSource, /tacticalCourtSupportPoseCell\(unitType, resolvedPose\)/,
  'court support units must render from the dedicated support sheet cell');
assert.match(zoneSource, /TACTICAL_COURT_SUPPORT_POSE_SHEET/,
  'court support sprites must use the new support pose sheet');
assert.match(zoneSource, /tacticalSpriteMetricVars\('courtSupport', supportCell\.column, supportCell\.row\)/,
  'court support sprites must use the courtSupport metric contract');
assert.match(zoneSource, /supportView\.statusLabel/,
  'support unit status must come from the backend support view label');
assert.doesNotMatch(zoneSource, /supportState\./,
  'the stage must not read raw support state fields');
assert.match(zoneSource, /event\.kind === 'hwachaVolley'/,
  'hwacha volleys must drive a distinct firing pose');
assert.match(zoneSource, /shots\?\.rockets/,
  'rocket counts must come from the event contract');
assert.match(zoneSource, /event\.kind === 'enemyTreatment' && event\.groupId === group\.id/,
  'enemy treatment must animate only the acting medic group');
assert.match(screenSource, /supportReload: 'hammer'/,
  'support reload playback must have its own sound cue');
assert.match(screenSource, /enemyTreatment: 'heal'/,
  'enemy treatment playback must have a healing sound cue');
assert.match(screenSource, /event\.kind === 'hwachaVolley'/,
  'hwacha volleys must have a distinct salvo sound path');
assert.match(screenSource, /report\.raiderPowerRestored/,
  'the round report must surface enemy power restored as a report figure');
assert.doesNotMatch(screenSource, /전사자.*복귀|부활/,
  'enemy treatment must never be described as reviving the dead');
assert.match(minimapSource, /tacticalSupportUnitView\(battle, group\)/,
  'minimap tooltips must read support status from the backend view');
assert.match(cssSource, /\.tactical-zone\.event-enemyTreatment \.tactical-raider-group\.treating/,
  'enemy treatment must pulse only the treating group');
assert.match(cssSource, /\.fx-rocket/,
  'hwacha rockets must have dedicated projectile styling');
assert.match(cssSource, /prefers-reduced-motion[\s\S]*\.tactical-raider-group\.treating \{ animation: none; \}/,
  'the treatment pulse must respect reduced motion');

// ── Phase 9: 장계 적 전술 표기 (tactics 계약 소비 전용) ──
const reportModalSource = readFileSync(
  new URL('../../src/components/TacticalBattleReportModal.tsx', import.meta.url),
  'utf8',
);
assert.match(reportModalSource, /report\.tactics && \(/,
  'the tactics section must render only when the backend attached a tactics report');
assert.match(reportModalSource, /report\.tactics\.objectiveLabel/,
  'the enemy objective must display the backend-provided label');
assert.match(reportModalSource, /objectiveAchieved != null/,
  'the objective badge must distinguish unknown from achieved/denied');
assert.match(reportModalSource, /'목표 달성' : '목표 저지'/,
  'objective achievement must be labeled in text, not color alone');
assert.match(reportModalSource, /report\.tactics\.doctrineLabel/,
  'the doctrine must display the backend-provided label');
assert.match(reportModalSource, /report\.tactics\.compositionLabel/,
  'the composition must display the backend-provided label');
assert.match(reportModalSource, /FLANK_OUTCOME_LABELS\[route\.outcome\]/,
  'flank route outcomes must be labeled in text via the display-only map');
assert.match(reportModalSource, /\{route\.summary\}/,
  'route summaries must come from the backend sentence, not be rebuilt');
assert.doesNotMatch(reportModalSource, /routeEngagements|routeArrivals|tacticalBattleTacticsReport|flankRouteView/,
  'the report modal must not recompute tactics from raw route reports');
assert.match(cssSource, /\.battle-report-route-outcome\.raiderReachedRear/,
  'route outcome chips must have tone styling on top of their text labels');

console.log('tactical component extraction tests passed');
