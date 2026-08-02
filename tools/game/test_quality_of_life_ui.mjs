import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

async function importTypeScript(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const hotkeys = await importTypeScript('../../src/ui/gameHotkeys.ts');
assert.equal(hotkeys.dockWindowForHotkey('q'), 'jobs');
assert.equal(hotkeys.dockWindowForHotkey('R'), 'specialResidents');
assert.equal(hotkeys.dockWindowForHotkey('u'), 'incidents');
assert.equal(hotkeys.speedForHotkey('Digit1'), 1);
assert.equal(hotkeys.speedForHotkey('Numpad2'), 3);

const zoom = await importTypeScript('../../src/ui/mapZoom.ts');
assert.equal(zoom.steppedMapZoom(1, -100), 1.25);
assert.equal(zoom.steppedMapZoom(1, 100), 0.8);
assert.equal(zoom.steppedMapZoom(2, -100), 2);
assert.equal(zoom.steppedMapZoom(0.5, 100), 0.5);

const feedback = await importTypeScript('../../src/ui/feedbackReport.ts');
const feedbackState = {
  schemaVersion: 33, day: 44, subTick: 2, difficulty: 'normal', seed: 123, rank: 'bo',
  residents: [{ alive: true }, { alive: false }], buildings: [{ id: 1 }], pendingChoice: null,
  tacticalBattle: null, gameOver: null,
  log: [{ day: 44, kind: 'bad', important: true, text: '재현용 기록' }],
};
const feedbackUrl = new URL(feedback.buildFeedbackIssueUrl({
  kind: 'bug', title: '시험', description: '설명', reproduction: '단계', includeDiagnostics: true,
}, feedbackState, { speed: 1, zoom: 1.25, userAgent: 'test' }));
assert.equal(feedbackUrl.hostname, 'github.com');
assert.match(feedbackUrl.searchParams.get('body') ?? '', /재현용 기록/,
  'bug reports must include recent game logs when diagnostics are opted in');

for (const name of ['jobs', 'processing', 'residents', 'special-residents', 'factions', 'court', 'incidents']) {
  const url = new URL(`../../public/assets/ui/dock-${name}-v1.png`, import.meta.url);
  assert.equal(existsSync(url), true, `${name} dock icon must exist`);
  const png = readFileSync(url);
  assert.equal(png.toString('ascii', 1, 4), 'PNG', `${name} dock icon must be a PNG`);
}

const appSource = readFileSync(new URL('../../src/GameSession.tsx', import.meta.url), 'utf8');
const mainMenuSource = readFileSync(new URL('../../src/components/MainMenu.tsx', import.meta.url), 'utf8');
const newGameSetupSource = readFileSync(new URL('../../src/components/NewGameSetup.tsx', import.meta.url), 'utf8');
const readmeSource = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
const topBarSource = readFileSync(new URL('../../src/components/TopBar.tsx', import.meta.url), 'utf8');
const gameMenuSource = readFileSync(new URL('../../src/components/GameMenu.tsx', import.meta.url), 'utf8');
const canvasSource = readFileSync(new URL('../../src/components/GameCanvas.tsx', import.meta.url), 'utf8');
const minimapSource = readFileSync(new URL('../../src/components/Minimap.tsx', import.meta.url), 'utf8');
const musicSource = readFileSync(new URL('../../src/sound/music.ts', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
const atlasSource = readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8');
assert.match(appSource, /event\.code === 'Space'/);
assert.match(appSource, /dockWindowForHotkey\(event\.key\)/);
assert.match(appSource, /gameMenuView === 'settings'/);
assert.doesNotMatch(mainMenuSource, /다섯 해의 겨울/,
  'the title screen must not present the obsolete five-winter goal as the whole game');
assert.match(mainMenuSource, /부\(府\)로 성장/,
  'the title screen must describe the current promotion objective');
assert.match(readmeSource, /소형 56×56 · 중형 72×72 · 대형 96×96 절차 생성 지도/);
assert.match(readmeSource, /`Space` \| 일시정지/);
assert.match(readmeSource, /효과음\(SE\)과 배경 음악\(BGM\)/);
assert.doesNotMatch(topBarSource, /onClick=\{onSave\}|onClick=\{onLoad\}|onClick=\{onNewGame\}/,
  'save, load, and new game must no longer be direct TopBar actions');
assert.match(gameMenuSource, />저장<[\s\S]*>불러오기<[\s\S]*>새 게임<[\s\S]*>설정</);
assert.match(canvasSource, /onWheel=\{handleWheel\}/);
assert.match(canvasSource, /resetZoom[\s\S]*requestZoom\(1\)/);
assert.match(stylesSource, /\.canvas-wrap\s*\{[\s\S]*?overflow:\s*hidden;/,
  'the map viewport must not expose native wheel scrolling after wheel zoom is enabled');
assert.match(minimapSource, /mapViewportScale\(box\)/,
  'minimap navigation must account for the rendered map zoom');
assert.match(musicSource, /Math\.max\(0, Math\.min\(1, \(now - startedAt\) \/ CROSSFADE_MS\)\)/,
  'music crossfades must clamp animation progress before assigning HTML audio volume');
assert.match(atlasSource, /specialResidentSheet[\s\S]*bob, 1\.16/,
  'special residents must render slightly larger than ordinary residents');

// 새 게임 설정은 독립 화면이며 메뉴는 네 진입점과 조건부 이어하기만 맡는다.
{
  const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  const menu = readFileSync(new URL('../../src/components/MainMenu.tsx', import.meta.url), 'utf8');
  const launch = readFileSync(new URL('../../src/sessionLaunch.ts', import.meta.url), 'utf8');
  const session = readFileSync(new URL('../../src/GameSession.tsx', import.meta.url), 'utf8');
  assert.match(app, /menuView[^\n]*'newGameSetup'/);
  assert.match(app, /NewGameSetup/);
  assert.doesNotMatch(menu, /settlement-name-input|diff-card/,
    'main menu no longer owns settlement or difficulty inputs');
  for (const entry of ['>시작<', '튜토리얼', '전투 시뮬레이션', '>설정<']) {
    assert.ok(menu.includes(entry), `main menu preserves the ${entry} entry point`);
  }
  assert.match(menu, /canContinue[\s\S]*이어하기/,
    'continue remains a conditional auxiliary action');
  assert.match(launch, /kind:\s*'new';\s*options:\s*NewGameOptions/);
  assert.match(session, /newGameFromOptions\(launch\.options\)/);
  for (const region of ['plains', 'mountain', 'lake', 'coast']) {
    assert.match(newGameSetupSource, new RegExp(`id: '${region}'`), `new game setup declares the ${region} region`);
  }
  const regionCardsSource = newGameSetupSource.split('REGIONS.map(region =>')[1]?.split('</button>)}')[0] ?? '';
  assert.match(regionCardsSource, /onClick=\{\(\) => setOptions\(current => \(\{ \.\.\.current, region: region\.id \}\)\)\}/,
    'region cards persist their selected option');
  assert.match(newGameSetupSource, /id: 'mountain'[\s\S]*?enabled: true/,
    'mountain must be an available starting region');
  for (const region of ['lake', 'coast']) {
    assert.match(newGameSetupSource, new RegExp(`id: '${region}'[^\\n]*S[45]에서 준비됩니다`),
      `${region} remains a future locked region`);
  }
  assert.match(newGameSetupSource, /내부 능선과 깊은 숲[\s\S]*물과 평지는 부족[\s\S]*광물과 사냥감이 풍부/,
    'mountain description communicates its deliberate resource tradeoff');
  for (const size of ['small', 'medium', 'large']) {
    assert.match(newGameSetupSource, new RegExp(`id: '${size}'`), `new game setup offers the ${size} map size`);
  }
  const sizeCardsSource = newGameSetupSource.split('SIZES.map(size =>')[1]?.split('</button>)}')[0] ?? '';
  assert.doesNotMatch(sizeCardsSource, /disabled=/,
    'all map size cards must remain selectable');
  assert.match(newGameSetupSource, /onClick=\{\(\) => setOptions\(current => \(\{ \.\.\.current, mapSize: size\.id \}\)\)\}/,
    'map size cards persist their selected option');
}

console.log('quality-of-life UI tests passed');
