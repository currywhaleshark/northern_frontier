import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-court-permanent-artifacts-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const specialItems = await import(pathToFileURL(join(compiledDir, 'specialItems.mjs')).href);
const courtGrants = await import(pathToFileURL(join(compiledDir, 'courtGrants.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const tacticalBattle = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

const permanentIds = [
  'agriculturalEdict', 'medicalBook', 'militaryTreatise', 'telescope', 'royalPlaque', 'jijaChongtong',
  'royalSpear', 'royalHornBow', 'royalMusket',
];

for (const item of permanentIds) {
  assert.ok(specialItems.SPECIAL_ITEM_IDS.includes(item), `${item} is in the canonical catalog`);
  assert.ok(courtGrants.COURT_GRANT_ARTIFACT_IDS.includes(item), `${item} is eligible for court grants`);
  assert.equal(specialItems.SPECIAL_ITEM_DEFS[item].tradeValue, 0, `${item} cannot be traded`);
}
assert.deepEqual(specialItems.ARTIFACT_WEAPON_IDS, ['royalSpear', 'royalHornBow', 'royalMusket']);

const state = simulation.newGame(20260729);
for (const job of ['farmer', 'physician', 'hunter', 'watchman', 'militia']) {
  assert.equal(specialItems.skillGainArtifactMultiplier(state, job), 1, `${job} starts without an artifact bonus`);
}
state.specialItems.agriculturalEdict = 1;
state.specialItems.medicalBook = 1;
state.specialItems.militaryTreatise = 1;
assert.equal(specialItems.skillGainArtifactMultiplier(state, 'farmer'), CONFIG.courtGrants.skillArtifactGainMultiplier);
assert.equal(specialItems.skillGainArtifactMultiplier(state, 'physician'), CONFIG.courtGrants.skillArtifactGainMultiplier);
for (const job of ['hunter', 'watchman', 'militia']) {
  assert.equal(specialItems.skillGainArtifactMultiplier(state, job), CONFIG.courtGrants.skillArtifactGainMultiplier);
}
assert.equal(specialItems.skillGainArtifactMultiplier(state, 'woodcutter'), 1, 'military treatise does not leak to other jobs');

// 배율 헬퍼만이 아니라 실제 모든 작업 경로가 공유하는 숙련 틱에도 정확히 한 번 적용된다.
for (const [job, item] of [
  ['farmer', 'agriculturalEdict'],
  ['physician', 'medicalBook'],
  ['hunter', 'militaryTreatise'],
  ['watchman', 'militaryTreatise'],
  ['militia', 'militaryTreatise'],
]) {
  const resident = state.residents[0];
  resident.job = job;
  resident.skills[job] = 0;
  state.specialItems[item] = 0;
  agents.gainSkillTick(state, resident);
  const ordinaryGain = resident.skills[job];
  resident.skills[job] = 0;
  state.specialItems[item] = 1;
  agents.gainSkillTick(state, resident);
  assert.ok(
    Math.abs(resident.skills[job] - ordinaryGain * CONFIG.courtGrants.skillArtifactGainMultiplier) < 1e-12,
    `${item} multiplies the real ${job} skill tick once`,
  );
}

const raidWithoutTelescope = tacticalBattle.settlementRaidPreparationPoints(state, true);
state.specialItems.telescope = 1;
assert.equal(
  tacticalBattle.settlementRaidPreparationPoints(state, true),
  Math.min(CONFIG.tacticalBattle.prep.max, raidWithoutTelescope + CONFIG.courtGrants.telescopePreparationPoints),
  'telescope adds preparation only to settlement raids',
);
const assaultSource = readFileSync(new URL('../../src/game/tacticalAssault.ts', import.meta.url), 'utf8');
assert.doesNotMatch(assaultSource, /telescope|telescopePreparationPoints/,
  'telescope does not alter expedition tactical assault preparation');

console.log('court grant permanent artifact tests passed');
