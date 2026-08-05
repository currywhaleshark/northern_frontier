import { readAppCss } from '../app-stylesheets.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/GameSession.tsx', import.meta.url), 'utf8');
const contextSource = readFileSync(new URL('../../src/components/SelectionContextBar.tsx', import.meta.url), 'utf8');
const drawerSource = readFileSync(new URL('../../src/components/BuildDrawer.tsx', import.meta.url), 'utf8');
const canvasSource = readFileSync(new URL('../../src/components/GameCanvas.tsx', import.meta.url), 'utf8');
const inspectorSource = readFileSync(new URL('../../src/components/InspectorPanel.tsx', import.meta.url), 'utf8');
const actionPopupSource = readFileSync(new URL('../../src/components/ActionPopup.tsx', import.meta.url), 'utf8');
const jobPanelSource = readFileSync(new URL('../../src/components/JobPanel.tsx', import.meta.url), 'utf8');
const weaponAllocationSource = readFileSync(new URL('../../src/components/WeaponAllocationDialog.tsx', import.meta.url), 'utf8');
const weaponDialogSource = readFileSync(new URL('../../src/components/WeaponAllocationDialog.tsx', import.meta.url), 'utf8');
const residentsWindowSource = readFileSync(new URL('../../src/components/dock/ResidentsWindow.tsx', import.meta.url), 'utf8');
const cssSource = readAppCss();

assert.match(appSource, /<SelectionContextBar\b[\s\S]*selectedEntity=\{selectedEntity\}/,
  'App must render the selection context from the canonical selected entity');
assert.match(appSource,
  /\.\.\.\(selectedEntity \? \[\{[\s\S]*id:\s*'selection'[\s\S]*className:\s*'hud-selection-window'[\s\S]*<SelectionContextBar/,
  'the selection context must appear conditionally as a floating HUD window');
assert.match(contextSource, /selectedEntity\.kind === 'resident'/,
  'resident selection must render in the bottom context bar');
assert.match(contextSource,
  /resident\.religiousVocation === 'monk'[\s\S]*resident\.stage[\s\S]*'동자승'/,
  'a selected monk novice must be labelled as a novice rather than unemployed');
assert.match(contextSource,
  /JOB_ORDER\.includes\(resident\.job\)[\s\S]*\[resident\.job\][\s\S]*\.filter\(job => job === resident\.job/,
  'a selected religious resident must retain a current-job option even when that job is not assignable');
assert.match(contextSource,
  /적재 \{Math\.floor\(haulerCarryCapacity\(resident\)\)\}/,
  'hauler carry capacity must be floored before it is shown');
assert.match(contextSource,
  /water\.source === 'canal'[\s\S]*'농수로'/,
  'building water details must identify canal supply separately from wells and rivers');
assert.match(weaponAllocationSource,
  /Math\.floor\(snapshot\.basePower \+ snapshot\.weaponPower\)/,
  'artifact-adjusted personal defense contribution must not expose a fractional tail');
assert.match(canvasSource,
  /hoveredResident\.religiousVocation === 'monk'[\s\S]*hoveredResident\.stage[\s\S]*'동자승'/,
  'the map resident tooltip must use the same novice label');
assert.match(canvasSource,
  /isExplored\(state, hoverTile\.x, hoverTile\.y\)[\s\S]*wellWaterStatusAt\(state, hoverTile\.x, hoverTile\.y\)/,
  'well placement must not sample underground water before the tile has been explored');
assert.match(canvasSource,
  /geomancerPresent \? \([\s\S]*예상 취수 하루 \{Math\.floor\(wellPlacementStatus\.dailyOutput\)\}[\s\S]*수위 \{Math\.floor\(wellPlacementStatus\.levelRatio \* 100\)\}%[\s\S]*\) : <div className="muted">물이 있는 땅입니다<\/div>/,
  'well placement must keep non-geomancer guidance qualitative and show geomancers integer live output data');
assert.match(contextSource, /foreignSiteAt[\s\S]*<ForeignSitePanel/,
  'foreign-site actions must remain available in the bottom context bar');
assert.match(contextSource, /<ActionPopup[\s\S]*embedded/,
  'building actions must reuse the established action controls inside the context bar');
assert.match(contextSource, /building\.type === 'cellar'[\s\S]*저장 보호[\s\S]*spoilage\.protectedTotal/,
  'completed cellars must show the protected raw-food amount in the selection context');
assert.match(contextSource, /building\.type === 'cemetery'[\s\S]*안치 기록[\s\S]*record\.name[\s\S]*record\.cause[\s\S]*record\.deathDay/,
  'cemeteries must show the buried name, cause of death, and death day');
assert.match(contextSource, /building\.type === 'stable'[\s\S]*마릿수[\s\S]*번식[\s\S]*곡물/,
  'completed stables must show flock size, breeding progress, and daily feed use');
assert.match(contextSource, /<td>탑승<\/td>[\s\S]*mountAssignments/,
  'combat resident details must show their current mount');
assert.match(weaponDialogSource, /onAssignMount[\s\S]*horseStock[\s\S]*className="mount-select"/,
  'the weapon allocation dialog must expose a separate horse assignment column');
assert.match(residentsWindowSource, /무기·군마 배분[\s\S]*UiIcon name="mounted"[\s\S]*기마/,
  'the resident dock must advertise and summarize horse assignment');
assert.match(weaponDialogSource, /onAssignArtifact[\s\S]*ARTIFACT_WEAPON_IDS[\s\S]*artifact-weapon-select/,
  'the weapon allocation dialog must expose independent artifact weapon assignment');
assert.match(contextSource, /artifactWeaponForResident[\s\S]*ARTIFACT_WEAPON_NAMES[\s\S]*\(고유\)/,
  'resident selection details must identify an assigned artifact weapon');
assert.match(appSource, /onSlaughterLivestock=\{handleSlaughterLivestock\}/,
  'the stable slaughter action must be wired to the simulation from App');
assert.doesNotMatch(canvasSource, /ActionPopup/,
  'the map canvas must not keep a duplicate building action popup');
assert.doesNotMatch(inspectorSource, /tab === 'tile'|ResidentDetail/,
  'the right inspector must no longer duplicate tile or resident selection details');
assert.match(actionPopupSource, /assignedSlotResidents\(state, building\)/,
  'worker slot rows must render preserved assignments rather than active production workers only');
assert.match(actionPopupSource, /worker\.sick[\s\S]*와병 중 · 생산 중단/,
  'a sick assignee must remain named in the slot with an inactive status');
assert.match(actionPopupSource, /worker-slot-row\$\{workerInactive \? ' inactive' : ''\}/,
  'temporarily unavailable assignees must receive a distinct inactive slot style');
assert.match(jobPanelSource, /isResidentAvailableForWorkerSlot\(state, resident\)[\s\S]*배치 가능/,
  'the job panel must count only residents who automatic assignment can actually place');
assert.match(cssSource, /\.worker-slot-row\.inactive[\s\S]*\.worker-slot-main/,
  'inactive preserved slots must have a visible disabled-work treatment');

assert.doesNotMatch(drawerSource, /selectionActive/,
  'selection state must not close or disable the independently positioned build drawer');
assert.match(drawerSource, /const startPlacement[\s\S]*onClearSelection\(\)[\s\S]*setPlacingType\(type\)/,
  'starting construction placement must clear the current selection first');
assert.match(cssSource, /\.selection-context-bar\s*\{[\s\S]*position:\s*relative;[\s\S]*width:\s*clamp\(250px, 20vw, 360px\);/,
  'the standalone selection context must retain its compact fallback styling');
assert.match(cssSource, /\.build-drawer-shell\s*\{[\s\S]*left:\s*10px;[\s\S]*width:\s*clamp\(250px, 20vw, 360px\);[\s\S]*align-items:\s*stretch;/,
  'the build drawer and its category menu must share one compact left-aligned shell');
assert.match(cssSource, /\.selection-context-body\s*\{[\s\S]*overflow:\s*auto;/,
  'long selection details must scroll inside the context bar');
assert.match(cssSource,
  /\.hud-selection-window \.selection-context-bar\s*\{[\s\S]*width:\s*100%;[\s\S]*min-height:\s*100%;[\s\S]*max-height:\s*none;/,
  'the selection context must fill its resizable floating window');
assert.doesNotMatch(appSource, /right-lower-stack/,
  'the fixed lower-right context stack must be removed');

console.log('selection context UI tests passed');
