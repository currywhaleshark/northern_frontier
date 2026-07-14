import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
  const files = readdirSync(srcDir).filter(file => file.endsWith('.ts'));
  for (const file of files) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
      if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
      return `${start}${spec}.mjs${end}`;
    });
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

// saveLoad가 쓰는 localStorage 스텁 (마이그레이션 테스트용)
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: k => store.delete(k),
};

const compiledDir = compileGameModules();
const petition = await import(pathToFileURL(join(compiledDir, 'petition.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const battles = await import(pathToFileURL(join(compiledDir, 'battles.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

const { canPetition, grantYearlyPowder, PETITION_OFFERS, requestPetition, resolvePetition } = petition;

function addBuilt(state, type, n = 1) {
  for (let i = 0; i < n; i++) {
    state.buildings.push({
      id: 9000 + state.buildings.length, type, x: 0, y: 0,
      progress: 99, built: true, fieldGrowth: 0,
    });
  }
}

function prepareBuildableLandTile(state, type) {
  for (let y = 2; y < CONFIG.map.height - 2; y++) {
    for (let x = 2; x < CONFIG.map.width - 2; x++) {
      const tiles = buildings.buildingFootprintTiles(state, type, x, y);
      if (!tiles || tiles.some(tile => tile.buildingId != null)) continue;
      for (const tile of tiles) {
        tile.terrain = 'plain';
        tile.hasIron = false;
        tile.buildingId = null;
        state.exploration.explored[tile.y][tile.x] = true;
      }
      if (buildings.canPlaceBuildingAt(state, type, x, y)) return state.map[y][x];
    }
  }
  throw new Error(`no buildable land tile for ${type}`);
}

// ── 청원 자격: 승격 단계·쿨다운 ──
{
  const state = simulation.newGame(11);
  assert.ok(canPetition(state).includes('보(堡)'), '개척지는 청원 불가');
  assert.ok(requestPetition(state), '개척지는 모달이 열리지 않는다');
  assert.equal(state.pendingChoice, null);

  state.rank = 'bo';
  assert.equal(canPetition(state), null);
  assert.equal(requestPetition(state), null);
  assert.equal(state.pendingChoice?.kind, 'petition');

  // 보 단계 목록: 기본 물자만, 조총/포는 없다
  const ids = state.pendingChoice.options.map(o => o.id);
  assert.ok(ids.includes('grain'));
  assert.ok(ids.includes('powder-small'));
  assert.ok(!ids.includes('muskets'), '조총은 진부터');
  assert.ok(!ids.includes('cannon'), '불랑기포는 부부터');
  assert.ok(ids.includes('cancel'));
  state.pendingChoice = null;

  // 진 단계 목록
  state.rank = 'jin';
  requestPetition(state);
  const jinIds = state.pendingChoice.options.map(o => o.id);
  assert.ok(jinIds.includes('muskets'));
  assert.ok(jinIds.includes('porcelain'));
  assert.ok(jinIds.includes('silk'));
  assert.ok(!jinIds.includes('cannon'));
  state.pendingChoice = null;
}

// ── 명성 미달 시 비활성 / 수령 시 명성 차감·물자 지급·쿨다운 시작 ──
{
  const state = simulation.newGame(11);
  state.rank = 'bo';
  state.resources.reputation = 26; // grain(25)만 가능
  requestPetition(state);
  const opts = state.pendingChoice.options;
  assert.equal(opts.find(o => o.id === 'grain').disabled, false);
  assert.equal(opts.find(o => o.id === 'powder-small').disabled, true, '명성 45 미달');

  const grainOffer = PETITION_OFFERS.find(o => o.id === 'grain');
  const grain0 = state.resources.grain;
  resolvePetition(state, 'grain');
  assert.equal(state.pendingChoice, null);
  assert.equal(state.resources.grain, grain0 + 30);
  assert.equal(state.resources.reputation, 26 - grainOffer.repCost);
  assert.equal(state.lastPetitionDay, state.day);
  assert.ok(canPetition(state).includes('일 뒤'), '쿨다운 시작');

  // 쿨다운이 지나면 다시 가능
  state.day += CONFIG.petition.cooldownDays;
  assert.equal(canPetition(state), null);
}

// ── 취소는 쿨다운을 쓰지 않는다 ──
{
  const state = simulation.newGame(11);
  state.rank = 'bo';
  requestPetition(state);
  resolvePetition(state, 'cancel');
  assert.equal(state.lastPetitionDay, 0);
  assert.equal(canPetition(state), null);
}

// ── 사치품: 청원으로 재고를 받고, 사용할 때만 사기가 오른다 ──
{
  const state = simulation.newGame(11);
  state.rank = 'jin';
  state.resources.reputation = 80;
  for (const r of state.residents) r.morale = 50;
  requestPetition(state);
  resolvePetition(state, 'silk');
  assert.equal(state.resources.silk, 2);
  assert.ok(state.residents.every(r => r.morale === 50));

  assert.equal(simulation.useLuxuryGood(state, 'silk'), null);
  assert.equal(state.resources.silk, 1);
  assert.ok(state.residents.every(r => r.morale === 50 + CONFIG.petition.luxuryMorale));
  assert.equal(simulation.useLuxuryGood(state, 'grain'), '사치품이 아닙니다.');
}

// ── 불랑기포: 배치권 부여, 배치권 없으면 건설 불가 ──
{
  const state = simulation.newGame(11);
  state.rank = 'bu';
  state.resources.reputation = 90;
  const tile = prepareBuildableLandTile(state, 'cannonEmplacement');
  const err = simulation.tryPlaceBuilding(state, 'cannonEmplacement', tile.x, tile.y);
  assert.ok(err.includes('하사'), '하사 전엔 배치 불가');

  requestPetition(state);
  resolvePetition(state, 'cannon');
  assert.equal(state.cannonsGranted, 1);
  state.resources.wood = 50;
  state.resources.stone = 50;
  const err2 = simulation.tryPlaceBuilding(state, 'cannonEmplacement', tile.x, tile.y);
  assert.equal(err2, null, '하사 후엔 배치 가능');
  const nextTile = prepareBuildableLandTile(state, 'cannonEmplacement');
  const err3 = simulation.tryPlaceBuilding(state, 'cannonEmplacement', nextTile.x, nextTile.y);
  assert.ok(err3?.includes('하사'), '배치권 소진 후엔 다시 불가');
}

// ── 연례 화약 배급: 진 이상만 ──
{
  const state = simulation.newGame(11);
  grantYearlyPowder(state);
  assert.equal(state.resources.gunpowder, 0, '개척지는 배급 없음');
  state.rank = 'jin';
  grantYearlyPowder(state);
  assert.equal(state.resources.gunpowder, CONFIG.petition.yearlyPowder.jin);
}

// ── 조총 방어: 화약이 있어야 수비병 기여가 커진다 ──
{
  const state = simulation.newGame(11);
  for (const r of state.residents) r.job = 'idle';
  state.residents[0].job = 'militia';
  state.residents[1].job = 'militia';
  state.resources.muskets = 2;

  state.resources.gunpowder = 0;
  const cold = buildings.computeDefense(state);
  state.resources.gunpowder = 5;
  const armed = buildings.computeDefense(state);
  assert.equal(buildings.armedMusketeers(state), 2);
  assert.equal(armed - cold, 2 * (CONFIG.raid.musketDefense - CONFIG.raid.militiaDefense));

  // 조총이 수비병보다 많아도 무장 수는 수비병 수까지
  state.resources.muskets = 10;
  assert.equal(buildings.armedMusketeers(state), 2);
}

// ── 포대 배율과 교전 화약 소모 ──
{
  const state = simulation.newGame(11);
  assert.equal(battles.cannonBattleMult(state), 1);
  addBuilt(state, 'cannonEmplacement');
  state.resources.gunpowder = 0;
  assert.equal(battles.cannonBattleMult(state), 1, '화약 없으면 배율 없음');
  state.resources.gunpowder = 5;
  assert.equal(battles.cannonBattleMult(state), CONFIG.raid.cannonBattleMult);

  // 소모: 포 1문 (조총병 없음) → powderPerCannon
  battles.consumeBattlePowder(state);
  assert.equal(state.resources.gunpowder, 5 - CONFIG.raid.powderPerCannon);

  // 포 1문분보다 적으면 발사하지 않고 화약을 보존한다
  state.resources.gunpowder = 0.5;
  battles.consumeBattlePowder(state);
  assert.equal(state.resources.gunpowder, 0.5);

  // 화약이 0이면 아무 일도 없다
  state.resources.gunpowder = 0;
  battles.consumeBattlePowder(state);
  assert.equal(state.resources.gunpowder, 0);
}

// ── 저장 마이그레이션: 새 자원·청원 필드 기본값 ──
{
  const state = simulation.newGame(5);
  delete state.resources.gunpowder;
  delete state.resources.muskets;
  delete state.lastPetitionDay;
  delete state.cannonsGranted;
  saveLoad.saveGame(state);
  const loaded = saveLoad.loadGame();
  assert.equal(loaded.resources.gunpowder, 0);
  assert.equal(loaded.resources.muskets, 0);
  assert.equal(loaded.lastPetitionDay, 0);
  assert.equal(loaded.cannonsGranted, 0);
}

console.log('petition tests passed');
