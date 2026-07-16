import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const dockSource = readFileSync(new URL('../../src/components/dock/DockFrame.tsx', import.meta.url), 'utf8');
const residentSource = readFileSync(new URL('../../src/components/dock/ResidentsWindow.tsx', import.meta.url), 'utf8');
const factionSource = readFileSync(new URL('../../src/components/dock/FactionsWindow.tsx', import.meta.url), 'utf8');
const courtSource = readFileSync(new URL('../../src/components/dock/CourtWindow.tsx', import.meta.url), 'utf8');
const inspectorSource = readFileSync(new URL('../../src/components/InspectorPanel.tsx', import.meta.url), 'utf8');
const dockPresentationSource = readFileSync(new URL('../../src/ui/dockPresentation.ts', import.meta.url), 'utf8');
const minimapSource = readFileSync(new URL('../../src/components/Minimap.tsx', import.meta.url), 'utf8');
const topBarSource = readFileSync(new URL('../../src/components/TopBar.tsx', import.meta.url), 'utf8');

for (const id of ['residents', 'factions', 'court']) {
  assert.match(dockPresentationSource, new RegExp(`['"]${id}['"]`), `${id} must be a supported dock window`);
  assert.match(appSource, new RegExp(`id: ['"]${id}['"]`), `${id} must be registered in the dock frame`);
}

assert.match(dockSource, /openWindowIds: readonly DockWindowId\[\]/,
  'dock visibility must be controlled by App so other UI can open a window');
assert.match(appSource, /onOpenCourt=\{\(\) => openDockWindow\('court'\)\}/,
  'every TopBar court request must open the court dock window');
assert.doesNotMatch(topBarSource, /조정 탭에서/,
  'TopBar guidance must refer to the docked court window rather than a removed tab');
assert.match(residentSource, /onSelectResident\(resident\.id\)/,
  'resident rows must retain direct resident selection');
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
