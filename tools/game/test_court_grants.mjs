import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
      if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
      return `${start}${spec}.mjs${end}`;
    });
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const grants = await import(pathToFileURL(join(compiledDir, 'courtGrants.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const livestock = await import(pathToFileURL(join(compiledDir, 'livestock.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);
const {
  COURT_GRANT_RESOURCE_CANDIDATES,
  COURT_GRANT_LIVESTOCK_CANDIDATES,
  COURT_GRANT_ARTIFACT_IDS,
  grantYearScale,
  rollCourtGrantArtifact,
  rollCourtGrantRewards,
  rollCourtGrantResources,
} = grants;

assert.equal(grantYearScale(1), 1);
assert.equal(grantYearScale(10), 1.72);
assert.equal(grantYearScale(11), 1.8);
assert.equal(grantYearScale(30), 1.8);
assert.equal(CONFIG.courtGrants.extraPracticalChance, 0.4);
assert.equal(CONFIG.courtGrants.advancedChance, 0.35);
assert.equal(CONFIG.courtGrants.artifactChance, 0.12);
assert.equal(CONFIG.courtGrants.artifactPityMisses, 4);
assert.deepEqual(COURT_GRANT_ARTIFACT_IDS, [
  'reliefGrainVoucher', 'tributeWaiverDecree', 'recruitmentNotice', 'rainGauge',
  'agriculturalEdict', 'medicalBook', 'militaryTreatise', 'telescope', 'royalPlaque', 'jijaChongtong',
  'royalSpear', 'royalHornBow', 'royalMusket',
]);

assert.ok(!COURT_GRANT_RESOURCE_CANDIDATES.some(candidate => candidate.resource === 'strawShoes'));
assert.ok(!COURT_GRANT_RESOURCE_CANDIDATES.some(candidate => candidate.resource === 'hay'));
assert.deepEqual(COURT_GRANT_LIVESTOCK_CANDIDATES[0].species, ['chicken', 'goat', 'sheep', 'pig', 'cattle']);
assert.deepEqual(COURT_GRANT_LIVESTOCK_CANDIDATES[1].species, ['horse']);

const rankOrder = { settlement: 0, bo: 1, jin: 2, bu: 3 };
let sawExtraPractical = false;
let sawAdvanced = false;

for (const rank of Object.keys(rankOrder)) {
  for (let year = 1; year <= 12; year++) {
    for (const seed of [1, 7, 42, 99, 20260728]) {
      const first = rollCourtGrantResources(seed, year, rank);
      const second = rollCourtGrantResources(seed, year, rank);
      assert.deepEqual(first, second, `same seed/year/rank is deterministic (${seed}/${year}/${rank})`);
      assert.ok(first.length >= 1 && first.length <= 3, 'practical grant is guaranteed and each bonus is at most one item');
      assert.ok(first.some(reward => reward.category === 'practical'), 'at least one practical grant');
      assert.equal(new Set(first.map(reward => reward.resource)).size, first.length, 'one grant never repeats a resource');

      const practicalCount = first.filter(reward => reward.category === 'practical').length;
      sawExtraPractical ||= practicalCount === 2;
      sawAdvanced ||= first.some(reward => reward.category === 'advanced');

      for (const reward of first) {
        assert.ok(Number.isInteger(reward.amount) && reward.amount >= 1, 'scaled amount is a positive integer');
        const matching = COURT_GRANT_RESOURCE_CANDIDATES.find(candidate =>
          candidate.resource === reward.resource
          && candidate.category === reward.category
          && rankOrder[candidate.minRank] <= rankOrder[rank]
          && (candidate.maxRank === undefined || rankOrder[rank] <= rankOrder[candidate.maxRank]),
        );
        assert.ok(matching, `eligible ${reward.category} candidate: ${reward.resource}`);
        assert.equal(reward.amount, Math.max(1, Math.round(matching.baseAmount * grantYearScale(year))));
      }
    }
  }
}

assert.ok(sawExtraPractical, '40% extra practical path is reachable');
assert.ok(sawAdvanced, '35% advanced path is reachable');

// 등급은 후보 풀만 바꾸며, 시드는 세계 시드와 연차만 쓴다.
assert.deepEqual(
  rollCourtGrantResources(20260728, 6, 'jin'),
  rollCourtGrantResources(20260728, 6, 'jin'),
  'inventory or tribute streak cannot affect this pure roll',
);

function addEmptyStable(state) {
  const stable = {
    id: state.nextBuildingId++, type: 'stable', x: 4, y: 4,
    progress: 9, built: true, fieldGrowth: 0,
    livestock: livestock.createLivestockState('chicken', 0),
  };
  state.buildings.push(stable);
  return stable;
}

// 축사가 없거나 수용량이 모자라면 가축은 실용 후보에서 빠진다.
{
  const state = simulation.newGame(20260728);
  state.rank = 'jin';
  const rewards = rollCourtGrantRewards(state, 2);
  assert.ok(!rewards.some(reward => reward.kind === 'livestock'), 'empty stable pool excludes livestock candidates');
}

// 같은 세계·연차·축사 상태에서는 축종과 결과도 결정적이며, 일반 가축에는 말이 섞이지 않는다.
{
  let generalReward = null;
  let warhorseReward = null;
  for (let seed = 1; seed <= 500 && (!generalReward || !warhorseReward); seed++) {
    const state = simulation.newGame(seed);
    state.rank = 'jin';
    addEmptyStable(state);
    const first = rollCourtGrantRewards(state, 2);
    const second = rollCourtGrantRewards(state, 2);
    assert.deepEqual(first, second, 'livestock grant roll is deterministic');
    for (const reward of first) {
      if (reward.kind !== 'livestock') continue;
      if (reward.grantType === 'livestock') generalReward ??= reward;
      if (reward.grantType === 'warhorse') warhorseReward ??= reward;
    }
  }
  assert.ok(generalReward, 'eligible general livestock grant path is reachable');
  assert.ok(warhorseReward, 'eligible warhorse grant path is reachable');
  assert.notEqual(generalReward.species, 'horse', 'general livestock never grants horses');
  assert.equal(warhorseReward.species, 'horse', 'warhorse candidate always grants horses');
  assert.equal(generalReward.amount, Math.round(2 * grantYearScale(2)));
  assert.equal(warhorseReward.amount, Math.round(1 * grantYearScale(2)));
}

function artifactRollState(seed, misses = 0) {
  const state = simulation.newGame(seed);
  state.courtGrantArtifactMisses = misses;
  return state;
}

// 기물 당첨은 같은 세계·연차에서 결정적이고, 물자 풀/등급/축사 가지와 RNG를 공유하지 않는다.
{
  const first = rollCourtGrantArtifact(artifactRollState(20260728), 2);
  const second = rollCourtGrantArtifact(artifactRollState(20260728), 2);
  assert.deepEqual(first, second, 'artifact roll is deterministic for a seed and year');

  const alteredBranch = artifactRollState(20260728);
  alteredBranch.rank = 'bu';
  addEmptyStable(alteredBranch);
  addEmptyStable(alteredBranch);
  assert.deepEqual(
    rollCourtGrantArtifact(alteredBranch, 2),
    first,
    'artifact hit/miss never depends on rank, resource pool, or stable branch RNG use',
  );
}

// 이미 가진 기물은 후보에서 빠지며, 소비형은 수량이 0이 되면 다시 후보가 된다.
{
  const originalChance = CONFIG.courtGrants.artifactChance;
  CONFIG.courtGrants.artifactChance = 1;
  try {
    const state = artifactRollState(77);
    state.specialItems.reliefGrainVoucher = 1;
    const excluded = rollCourtGrantArtifact(state, 2);
    assert.notEqual(excluded.item, 'reliefGrainVoucher', 'owned one-shot item is excluded until consumed');
    state.specialItems.reliefGrainVoucher = 0;
    let sawVoucher = false;
    for (let seed = 1; seed <= 100; seed++) {
      if (rollCourtGrantArtifact(artifactRollState(seed), 2).item === 'reliefGrainVoucher') sawVoucher = true;
    }
    assert.ok(sawVoucher, 'a consumed one-shot item becomes eligible again');
  } finally {
    CONFIG.courtGrants.artifactChance = originalChance;
  }
}

// 적격 후보가 모두 비면 천장을 소모하지 않고, 네 번 놓친 뒤 다음 적격 하사는 반드시 지급한다.
{
  const empty = artifactRollState(5, 4);
  for (const item of COURT_GRANT_ARTIFACT_IDS) empty.specialItems[item] = 1;
  assert.deepEqual(rollCourtGrantArtifact(empty, 10), {
    item: null, eligible: false, guaranteedByPity: false,
  }, 'an empty artifact pool does not produce or consume a pity result');

  const pity = rollCourtGrantArtifact(artifactRollState(5, 4), 10);
  assert.equal(pity.eligible, true);
  assert.equal(pity.guaranteedByPity, true);
  assert.ok(pity.item, 'the fifth eligible grant is guaranteed after four misses');
}

// 한 하사에서 같은 가축 하사 유형이 두 번 나오지 않는다.
{
  for (let seed = 1; seed <= 30; seed++) {
    for (let year = 2; year <= 6; year++) {
      const state = simulation.newGame(seed);
      state.rank = 'jin';
      addEmptyStable(state);
      addEmptyStable(state);
      const livestockGrantTypes = rollCourtGrantRewards(state, year)
        .filter(reward => reward.kind === 'livestock')
        .map(reward => reward.grantType);
      assert.equal(
        new Set(livestockGrantTypes).size,
        livestockGrantTypes.length,
        `no repeated livestock grant type (${seed}/${year})`,
      );
    }
  }
}

console.log('court grant resource tests passed');
