import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function transpile(source) {
  let output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
    /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
}

const rootDir = mkdtempSync(join(tmpdir(), 'northern-chongtong-tests-'));
const gameDir = join(rootDir, 'game');
const renderDir = join(rootDir, 'render');
mkdirSync(gameDir, { recursive: true });
mkdirSync(renderDir, { recursive: true });
for (const [sourceDir, outputDir] of [
  [new URL('../../src/game/', import.meta.url), gameDir],
  [new URL('../../src/render/', import.meta.url), renderDir],
]) {
  for (const file of readdirSync(sourceDir).filter(file => file.endsWith('.ts'))) {
    writeFileSync(join(outputDir, file.replace(/\.ts$/, '.mjs')), transpile(readFileSync(new URL(file, sourceDir), 'utf8')), 'utf8');
  }
}

const simulation = await import(pathToFileURL(join(gameDir, 'simulation.mjs')).href);
const buildings = await import(pathToFileURL(join(gameDir, 'buildings.mjs')).href);
const tribute = await import(pathToFileURL(join(gameDir, 'courtTribute.mjs')).href);
const grants = await import(pathToFileURL(join(gameDir, 'courtGrants.mjs')).href);
const reserve = await import(pathToFileURL(join(gameDir, 'tributeReserve.mjs')).href);
const specialItems = await import(pathToFileURL(join(gameDir, 'specialItems.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(gameDir, 'config.mjs')).href);
const generatedAssets = await import(pathToFileURL(join(renderDir, 'generatedBuildingAssets.mjs')).href);
const promotionAssets = await import(pathToFileURL(join(renderDir, 'promotionBuildingAssets.mjs')).href);
const obliqueAssets = await import(pathToFileURL(join(renderDir, 'obliqueBuildingAssets.mjs')).href);

assert.equal(buildings.BUILDING_DEFS.chongtongEmplacement.defense, 20, '총통 포대는 불랑기포대(+40)의 절반 방어도다');
assert.equal(buildings.BUILDING_DEFS.cannonEmplacement.defense, 40);
assert.ok(buildings.BUILD_MENU_ORDER.includes('chongtongEmplacement'), '총통 포대가 건설 메뉴에 등록된다');

for (const season of ['spring', 'winter']) {
  assert.deepEqual(
    generatedAssets.generatedBuildingSourceRect('chongtongEmplacement', season),
    generatedAssets.generatedBuildingSourceRect('cannonEmplacement', season),
    `생성 건물 표준 자산 별칭 (${season})`,
  );
  assert.deepEqual(
    generatedAssets.generatedLargeBuildingSourceRect('chongtongEmplacement', season),
    generatedAssets.generatedLargeBuildingSourceRect('cannonEmplacement', season),
    `생성 건물 HD 자산 별칭 (${season})`,
  );
  assert.deepEqual(
    promotionAssets.promotionBuildingSourceRect('chongtongEmplacement', season),
    promotionAssets.promotionBuildingSourceRect('cannonEmplacement', season),
    `승격 표준 자산 별칭 (${season})`,
  );
  assert.deepEqual(
    promotionAssets.promotionLargeBuildingSourceRect('chongtongEmplacement', season),
    promotionAssets.promotionLargeBuildingSourceRect('cannonEmplacement', season),
    `승격 HD 자산 별칭 (${season})`,
  );
}
assert.deepEqual(
  obliqueAssets.obliqueBuildingFrame('chongtongEmplacement', 'settlement'),
  obliqueAssets.obliqueBuildingFrame('cannonEmplacement', 'settlement'),
  '사선 표준·HD 시트도 불랑기포대 프레임을 공유한다',
);
assert.match(readFileSync(new URL('../../src/ui/buildPresentation.ts', import.meta.url), 'utf8'), /chongtongEmplacement:\s*'defense'/,
  '건설 드로어 선택 카테고리가 방어로 연결된다');
assert.match(readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8'), /chongtongEmplacement:\s*\{ base: FACE_STONE, glyph: BANNER_RED \}/,
  '기본 아틀라스도 기존 포대 셀을 사용한다');

function prepareState(seed = 20260729) {
  const state = simulation.newGame(seed);
  state.foreignSites = [];
  for (const resource of Object.keys(state.resources)) state.resources[resource] = 999;
  return state;
}

function buildSite(state, skip = new Set()) {
  for (let y = 0; y < state.map.length; y++) {
    for (let x = 0; x < state.map[y].length; x++) {
      const tile = state.map[y][x];
      if (tile.buildingId != null || tile.terrain !== 'plain' || skip.has(`${x},${y}`)) continue;
      const error = simulation.tryPlaceBuilding(state, 'chongtongEmplacement', x, y, undefined, undefined, { approveClearing: true });
      if (error === null) return { x, y };
      if (!error.includes('지자총통')) continue;
      return { x, y, requiresArtifact: true };
    }
  }
  throw new Error('No buildable total chongtong emplacement tile found');
}

// 기물 없이는 정상 배치 API가 거절하고, 받은 뒤에는 건설 중인 포대도 상한을 사용한다.
{
  const state = prepareState();
  let site = null;
  for (let y = 0; y < state.map.length && !site; y++) {
    for (let x = 0; x < state.map[y].length && !site; x++) {
      const tile = state.map[y][x];
      if (tile.buildingId != null || tile.terrain !== 'plain') continue;
      const error = simulation.tryPlaceBuilding(state, 'chongtongEmplacement', x, y, undefined, undefined, { approveClearing: true });
      if (error?.includes('지자총통')) site = { x, y };
    }
  }
  assert.ok(site, '기물 미보유 총통 포대 배치가 명확히 거절된다');

  specialItems.grantSpecialItem(state, 'jijaChongtong');
  assert.equal(simulation.tryPlaceBuilding(state, 'chongtongEmplacement', site.x, site.y, undefined, undefined, { approveClearing: true }), null);
  assert.equal(buildings.chongtongPlacementsUsed(state), 1, '건설 중 포대도 상한에 포함된다');
  assert.equal(state.specialItems.jijaChongtong, 1, '포대 건설은 지자총통 기물을 소비하지 않는다');

  const nextSite = buildSite(state, new Set([`${site.x},${site.y}`]));
  assert.equal(nextSite.requiresArtifact, true, '건설 중이거나 이전·해체 작업 중인 포대가 있으면 두 번째 포대를 막는다');

  const placement = state.buildings.find(building => building.type === 'chongtongEmplacement');
  buildings.clearBuildingTiles(state, placement.id);
  state.buildings = state.buildings.filter(building => building.id !== placement.id);
  assert.equal(buildings.chongtongPlacementsUsed(state), 0, '포대가 실제로 제거되면 재건 상한이 풀린다');
  assert.equal(simulation.tryPlaceBuilding(state, 'chongtongEmplacement', site.x, site.y, undefined, undefined, { approveClearing: true }), null,
    '해체·파괴 뒤에는 같은 지자총통으로 재건할 수 있다');
}

function payFullTribute(state, year) {
  state.courtTribute = { year, items: { grain: 1 }, dueDay: year * 48 - 11, resolved: false, paid: false };
  state.resources.grain = 1;
  assert.equal(reserve.setTributeReserve(state, 'grain', 1), null);
  tribute.openCourtTributeChoice(state);
  tribute.resolveCourtTribute(state, 'pay-full');
}

// 지자총통을 실제로 처음 하사할 때만 화약 여섯이 함께 오며, 일반 기물 지급 경로에는 부수 효과가 없다.
{
  const originalChance = CONFIG.courtGrants.artifactChance;
  CONFIG.courtGrants.artifactChance = 1;
  try {
    const state = prepareState(9101);
    for (const item of grants.COURT_GRANT_ARTIFACT_IDS) {
      if (item !== 'jijaChongtong') state.specialItems[item] = 1;
    }
    const powderBefore = state.resources.gunpowder;
    payFullTribute(state, 2);
    assert.equal(state.specialItems.jijaChongtong, 1);
    assert.equal(state.resources.gunpowder, powderBefore + CONFIG.courtGrants.jijaChongtongPowderAward,
      '최초 지자총통 하사에만 화약이 정확히 한 번 더해진다');
    assert.ok(state.log.some(entry => entry.text.includes('지자총통용 화약 6')), '화약 동봉이 하사 로그에 명시된다');

    const other = prepareState(9102);
    for (const item of grants.COURT_GRANT_ARTIFACT_IDS) {
      if (item !== 'reliefGrainVoucher') other.specialItems[item] = 1;
    }
    const otherPowder = other.resources.gunpowder;
    payFullTribute(other, 2);
    assert.equal(other.specialItems.reliefGrainVoucher, 1, '다른 기물 하사 경로를 구성한다');
    assert.equal(other.resources.gunpowder, otherPowder, '다른 기물에는 지자총통 화약 부수 효과가 없다');
  } finally {
    CONFIG.courtGrants.artifactChance = originalChance;
  }
}

{
  const originalChance = CONFIG.courtGrants.artifactChance;
  CONFIG.courtGrants.artifactChance = 0;
  try {
    const missed = prepareState(9103);
    const powderBefore = missed.resources.gunpowder;
    payFullTribute(missed, 2);
    assert.equal(missed.resources.gunpowder, powderBefore, '기물 추첨 실패에는 화약 부수 효과가 없다');
  } finally {
    CONFIG.courtGrants.artifactChance = originalChance;
  }
}

// 완공된 총통 포대가 있을 때만 재고와 무관한 화약 보급 후보가 생기며, 부에서는 화약 후보가 하나로 합쳐진다.
{
  const inactive = prepareState(9201);
  inactive.rank = 'settlement';
  inactive.buildings.push({ id: inactive.nextBuildingId++, type: 'chongtongEmplacement', x: 0, y: 0, progress: 0, built: false, fieldGrowth: 0 });
  for (let seed = 1; seed <= 100; seed++) {
    inactive.seed = seed;
    assert.ok(!grants.rollCourtGrantRewards(inactive, 2).some(reward => reward.resource === 'gunpowder'),
      '미완공 포대는 화약 보급 후보를 열지 않는다');
  }

  const built = prepareState(9202);
  built.rank = 'bu';
  built.buildings.push({ id: built.nextBuildingId++, type: 'chongtongEmplacement', x: 0, y: 0, progress: 6, built: true, fieldGrowth: 0 });
  const lowInventory = { ...built, resources: { ...built.resources, gunpowder: 0 } };
  const highInventory = { ...built, resources: { ...built.resources, gunpowder: 999 } };
  let sawPowder = false;
  for (let seed = 1; seed <= 400; seed++) {
    lowInventory.seed = seed;
    highInventory.seed = seed;
    const low = grants.rollCourtGrantRewards(lowInventory, 2);
    const high = grants.rollCourtGrantRewards(highInventory, 2);
    assert.deepEqual(low, high, '화약 재고는 총통 보급 후보의 포함·가중치에 영향을 주지 않는다');
    const powderRewards = low.filter(reward => reward.resource === 'gunpowder');
    assert.ok(powderRewards.length <= 1, '부 등급에서도 한 하사 안에 화약 후보가 중복되지 않는다');
    if (powderRewards.length > 0) {
      sawPowder = true;
      assert.equal(powderRewards[0].amount, Math.round(12 * grants.grantYearScale(2)),
        '부의 기존 화약 묶음은 총통 지원 때문에 더 작은 수량으로 낮아지지 않는다');
    }
  }
  assert.ok(sawPowder, '완공 총통 포대의 화약 보급 후보가 실제 추첨에 도달한다');
}

console.log('chongtong emplacement tests passed');
