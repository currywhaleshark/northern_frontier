import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-diplomatic-action-e3-tests-'));
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

function sequenceRng(values, fallback = 0.4) {
  let index = 0;
  return () => index < values.length ? values[index++] : fallback;
}

const compiledDir = compileGameModules();
const diplomacy = await import(pathToFileURL(join(compiledDir, 'diplomacy.mjs')).href);
const figures = await import(pathToFileURL(join(compiledDir, 'diplomaticFigures.mjs')).href);
const raids = await import(pathToFileURL(join(compiledDir, 'raids.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

assert.equal(CONFIG.diplomacy.raidTipRelation, 70);

{
  const state = simulation.newGame(73041);
  for (const factionName of figures.DIPLOMATIC_FACTION_NAMES) state.relations[factionName] = 0;

  state.relations['오도리 씨족'] = 69;
  assert.equal(
    diplomacy.raidTipInformant(state, '변경 마적'),
    null,
    '관계 69에서는 습격 귀띔이 없어야 한다',
  );

  state.relations['오도리 씨족'] = 70;
  assert.equal(
    diplomacy.raidTipInformant(state, '변경 마적')?.factionName,
    '오도리 씨족',
    '관계 70부터 다른 세력의 습격을 귀띔해야 한다',
  );
  assert.equal(
    diplomacy.raidTipInformant(state, '오도리 씨족'),
    null,
    '공격 세력 자신은 자기 습격을 귀띔할 수 없다',
  );

  state.relations['올량합 부락'] = 70;
  assert.equal(
    diplomacy.raidTipInformant(state, '변경 마적')?.factionName,
    '오도리 씨족',
    '동률이면 외교 세력 고정 순서로 결정해야 한다',
  );
  state.relations['올량합 부락'] = 71;
  assert.equal(
    diplomacy.raidTipInformant(state, '변경 마적')?.factionName,
    '올량합 부락',
    '관계가 더 높은 세력이 우선 귀띔해야 한다',
  );

  const informant = diplomacy.raidTipInformant(state, '변경 마적');
  const message = diplomacy.announceRaidTip(state, informant, '변경 마적');
  assert.match(message, new RegExp(informant.leader.name));
  assert.match(message, /변경 마적/);
  assert.equal(state.log.at(-1)?.kind, 'raid');
}

{
  const state = simulation.newGame(73042);
  state.day = 20;
  state.threat = 75;
  state.raidCooldown = 0;
  state.pendingChoice = null;
  state.raiders = null;
  state.specialItems.gyrfalcon = 0;
  for (const factionName of figures.DIPLOMATIC_FACTION_NAMES) state.relations[factionName] = 0;
  state.relations['오도리 씨족'] = 70;
  state.relations['변경 마적'] = 0;

  raids.checkRaidTrigger(state, sequenceRng([
    0,     // 습격 발생
    0.4,   // 전력
    0.999, // 적대 후보 중 마지막 변경 마적
    0,     // 협박 요구 품목
  ]));

  assert.equal(state.pendingChoice?.kind, 'extortion');
  assert.equal(state.pendingChoice?.data.faction, '변경 마적');
  assert.equal(state.pendingChoice?.data.warned, true);
  assert.equal(state.pendingChoice?.data.warningSource, 'diplomatic');
  assert.ok(
    state.log.some(entry => entry.text.includes('습격을 귀띔했습니다') && entry.text.includes('변경 마적')),
    '관계 70 우방의 지도자 명의 사전 로그가 남아야 한다',
  );

  raids.resolveExtortion(state, 'refuse', () => 0.4);
  const warnedAfterRefusal = state.raiders?.warned === true ||
    (state.pendingChoice?.kind === 'raid' && state.pendingChoice.data.warned === true);
  assert.equal(warnedAfterRefusal, true, '협박 거절 뒤 실제 습격도 warned 상태를 유지해야 한다');
  assert.equal(
    state.log.some(entry => entry.text.includes('봉수와 망루에서 경보')),
    false,
    '외교 귀띔을 봉수·망루 경보로 잘못 표시하면 안 된다',
  );
}

console.log('diplomatic action E3 tests passed');
