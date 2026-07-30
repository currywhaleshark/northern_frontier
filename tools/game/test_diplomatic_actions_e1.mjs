import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-diplomatic-action-tests-'));
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
const diplomacy = await import(pathToFileURL(join(compiledDir, 'diplomacy.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const { CURRENT_SCHEMA_VERSION } = await import(pathToFileURL(join(compiledDir, 'saveSchema.mjs')).href);

assert.equal(CURRENT_SCHEMA_VERSION, 49);
assert.equal(saveLoad.CURRENT_SCHEMA_VERSION, 49);

{
  const state = simulation.newGame(73040);
  const faction = '오도리 씨족';
  state.resources.silk = 3;
  const initialRelation = state.relations[faction];
  const initialSuspicion = state.suspicion;

  assert.match(diplomacy.canOpenGiftEnvoy(state, '변경 마적'), /여진 부족 지도자/);
  assert.equal(diplomacy.openGiftEnvoy(state, faction), null);
  assert.equal(state.pendingChoice.kind, 'giftEnvoy');
  const expected = diplomacy.giftPreview(state, faction, 'silk', 1);
  assert.equal(diplomacy.sendGiftEnvoy(state, faction, 'silk', 1), null);
  assert.equal(state.pendingChoice, null);
  assert.equal(state.resources.silk, 2, '예물은 사절 출발 즉시 차감된다');
  assert.equal(state.suspicion, initialSuspicion + expected.suspicion, '예물 발송은 즉시 의심을 올린다');
  assert.equal(state.pendingEnvoys.length, 1);
  assert.equal(state.pendingEnvoys[0].dueDay, 7);
  assert.equal(state.pendingEnvoys[0].relationGain, expected.relationGain, '왕복 결과는 발송 시점에 고정된다');
  assert.match(diplomacy.canOpenGiftEnvoy(state, faction), /왕복 중/);

  state.day = 7;
  diplomacy.dailyDiplomacyTick(state);
  assert.equal(state.pendingEnvoys.length, 0);
  assert.equal(state.relations[faction], initialRelation + expected.relationGain);
  assert.ok(state.log.some(entry => entry.text.includes('예물을 받았습니다')));
  assert.match(diplomacy.canOpenGiftEnvoy(state, faction), /이미 예물을 보냈습니다/);

  state.day = 13; // 다음 계절, 같은 해
  assert.equal(diplomacy.openGiftEnvoy(state, faction), null);
  const repeated = diplomacy.giftPreview(state, faction, 'silk', 1);
  assert.equal(repeated.repeatedThisYear, true);
  assert.ok(repeated.relationGain < expected.relationGain, '같은 해 두 번째 예물은 반감한다');
  assert.equal(diplomacy.sendGiftEnvoy(state, faction, 'silk', 1), null);
  state.day = 19;
  diplomacy.dailyDiplomacyTick(state);
  assert.equal(state.relations[faction], initialRelation + expected.relationGain + repeated.relationGain);
}

{
  const legacyLog = [{ day: 48, text: '기존 기록', kind: 'info' }];
  const migrated = saveLoad.migrateV48ToV49({ schemaVersion: 48, log: legacyLog });
  assert.equal(migrated.schemaVersion, 49);
  assert.deepEqual(migrated.pendingEnvoys, []);
  assert.deepEqual(migrated.giftEnvoyDays, {});
  assert.deepEqual(migrated.log, legacyLog, '외교 활동 마이그레이션은 과거 사절을 소급 생성하지 않는다');
}

const factionsSource = readFileSync(new URL('../../src/components/dock/FactionsWindow.tsx', import.meta.url), 'utf8');
const dialogSource = readFileSync(new URL('../../src/components/GiftEnvoyDialog.tsx', import.meta.url), 'utf8');
assert.match(factionsSource, /onOpenGiftEnvoy/);
assert.match(dialogSource, /giftPreview/);

console.log('diplomatic action E1 tests passed');
