import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const dockSource = readFileSync(new URL('../../src/components/dock/DockFrame.tsx', import.meta.url), 'utf8');
const dockWindowSource = readFileSync(new URL('../../src/components/dock/DockWindow.tsx', import.meta.url), 'utf8');
const residentSource = readFileSync(new URL('../../src/components/dock/ResidentsWindow.tsx', import.meta.url), 'utf8');
const factionSource = readFileSync(new URL('../../src/components/dock/FactionsWindow.tsx', import.meta.url), 'utf8');
const courtSource = readFileSync(new URL('../../src/components/dock/CourtWindow.tsx', import.meta.url), 'utf8');
const inspectorSource = readFileSync(new URL('../../src/components/InspectorPanel.tsx', import.meta.url), 'utf8');
const dockPresentationSource = readFileSync(new URL('../../src/ui/dockPresentation.ts', import.meta.url), 'utf8');
const minimapSource = readFileSync(new URL('../../src/components/Minimap.tsx', import.meta.url), 'utf8');
const topBarSource = readFileSync(new URL('../../src/components/TopBar.tsx', import.meta.url), 'utf8');

for (const id of ['residents', 'factions', 'court', 'incidents']) {
  assert.match(dockPresentationSource, new RegExp(`['"]${id}['"]`), `${id} must be a supported dock window`);
  assert.match(appSource, new RegExp(`id: ['"]${id}['"]`), `${id} must be registered in the dock frame`);
}

assert.match(dockSource, /openWindowIds: readonly DockWindowId\[\]/,
  'dock visibility must be controlled by App so other UI can open a window');
assert.match(dockSource, /windowOrder: readonly FloatingWindowId\[\]/,
  'management and HUD windows must share one global focus order');
assert.match(dockSource, /overlayItems[\s\S]*windowOrder\.indexOf\(item\.id\)/,
  'floating HUD items must use the same z-index layer as management windows');
assert.match(appSource, /bringDockWindowToFront\(current, id\)/,
  'opening or focusing an existing management window must bring it to the front');
assert.match(appSource, /layouts=\{uiPrefs\.dockWindowLayouts\}/,
  'saved management-window layouts must flow from UI preferences into the dock frame');
assert.match(dockWindowSource, /setPointerCapture\(event\.pointerId\)/,
  'dragging and resizing must keep pointer ownership outside the window bounds');
assert.match(dockWindowSource, /RESIZE_EDGES[\s\S]*'n'[\s\S]*'ne'[\s\S]*'se'[\s\S]*'sw'[\s\S]*'nw'/,
  'all four sides and four corners must expose resize handles');
assert.match(dockWindowSource, /stopImmediatePropagation\(\)[\s\S]*settleGesture\(gesture\.pointerId, false\)/,
  'Escape must cancel an active gesture before the App construction shortcut handles it');
assert.match(dockWindowSource, /requestAnimationFrame[\s\S]*onLayoutCommit/,
  'pointer movement must use temporary RAF DOM updates and commit through the layout callback');
assert.match(appSource, /onOpenCourt=\{\(\) => openDockWindow\('court'\)\}/,
  'every TopBar court request must open the court dock window');
assert.doesNotMatch(topBarSource, /조정 탭에서/,
  'TopBar guidance must refer to the docked court window rather than a removed tab');
assert.match(residentSource, /onSelectResident\(resident\.id\)/,
  'resident rows must retain direct resident selection');
assert.match(residentSource, /filteredResidents\(state, \{[\s\S]*query,[\s\S]*job: jobFilter,[\s\S]*status: statusFilter,[\s\S]*sort,/,
  'resident window must apply name, job, status, and sort controls to its visible rows');
assert.match(residentSource, /aria-label="주민 이름 찾기"[\s\S]*aria-label="주민 직업 필터"[\s\S]*aria-label="주민 상태 필터"[\s\S]*aria-label="주민 정렬 기준"/,
  'resident list controls must be keyboard-accessible and explicitly named');
assert.match(residentSource, /selectedHidden[\s\S]*선택한 주민은 현재 필터에 숨겨져 있습니다/,
  'filtering must preserve a hidden selection instead of clearing it');
assert.doesNotMatch(residentSource, /scrollTop\s*=/,
  'resident filtering and sorting must not reset the list scroll position');
assert.match(appSource, /handleSelectResidentFromDock[\s\S]*centerViewportOnTile/,
  'dock resident selection must center the map on that resident');
assert.match(minimapSource, /export function centerViewportOnTile/,
  'map centering must be reusable outside the minimap control');
assert.match(factionSource, /onRequestTrade\(faction\.name\)/,
  'faction trading must remain available in its dock window');
assert.match(courtSource, /onSetTributeReserve[\s\S]*onPetition[\s\S]*onUseLuxuryGood/,
  'court actions must remain available in its dock window');
assert.doesNotMatch(inspectorSource, /InspectorTab|JOB_NAMES|FACTIONS|CourtWindow|ResidentsWindow/,
  'the temporary right inspector must only retain incident and special-item content');

console.log('management dock UI tests passed');
