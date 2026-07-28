import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-court-grant-consumables-'));
  for (const file of readdirSync(srcDir).filter(name => name.endsWith('.ts'))) {
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
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const courtTribute = await import(pathToFileURL(join(compiledDir, 'courtTribute.mjs')).href);
const immigration = await import(pathToFileURL(join(compiledDir, 'immigration.mjs')).href);
const itemActions = await import(pathToFileURL(join(compiledDir, 'specialItemActions.mjs')).href);
const reserve = await import(pathToFileURL(join(compiledDir, 'tributeReserve.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function state(seed = 2026072801) {
  const value = simulation.newGame(seed, 'normal');
  value.day = 2;
  value.lastImmigrationDay = value.day;
  return value;
}

// 구휼미는 성공할 때만 한 장을 쓰고, 수량은 설정값을 쓴다.
{
  const value = state();
  value.specialItems.reliefGrainVoucher = 1;
  const grain = value.resources.grain;
  assert.equal(itemActions.useSpecialItem(value, 'reliefGrainVoucher'), null);
  assert.equal(value.resources.grain, grain + CONFIG.courtGrants.reliefGrainVoucherAmount);
  assert.equal(value.specialItems.reliefGrainVoucher, 0);
  assert.match(value.log.at(-1).text, /구휼미 어음/);
}

// 기존 면제권과 교지는 예약을 풀고, 명성/하사품/천장 없이 연속 납부만 유지한다.
for (const source of ['legacy', 'tributeWaiverDecree']) {
  const value = state(source === 'legacy' ? 2026072802 : 2026072803);
  value.courtTribute = { year: 2, items: { grain: 4 }, dueDay: 109, resolved: false, paid: false };
  value.resources.grain = 10;
  assert.equal(reserve.setTributeReserve(value, 'grain', 4), null);
  value.resources.reputation = 31;
  value.tributePaidStreak = 2;
  value.tributeFailStreak = 3;
  value.courtGrantArtifactMisses = 2;
  if (source === 'legacy') value.tributeWaivers = 1;
  else value.specialItems.tributeWaiverDecree = 1;
  assert.equal(courtTribute.resolveTributeWaiver(value, source), true);
  assert.equal(value.tributeWaivers + value.specialItems.tributeWaiverDecree, 0);
  assert.equal(value.courtTribute.resolved, true);
  assert.equal(value.courtTribute.paid, true);
  assert.equal(value.tributeReserve.grain ?? 0, 0);
  assert.equal(value.resources.grain, 10, '예약 물자가 다시 풀린다');
  assert.equal(value.tributePaidStreak, 3);
  assert.equal(value.tributeFailStreak, 0);
  assert.equal(value.resources.reputation, 31);
  assert.equal(value.courtGrantArtifactMisses, 2);
}

// 교지는 공지 전/해결 뒤에는 남고, 수거 모달에서는 선택지로 사용할 수 있다.
{
  const value = state();
  value.specialItems.tributeWaiverDecree = 1;
  value.courtTribute = null;
  assert.match(itemActions.useSpecialItem(value, 'tributeWaiverDecree'), /세공/);
  assert.equal(value.specialItems.tributeWaiverDecree, 1);
  value.courtTribute = { year: 1, items: { grain: 1 }, dueDay: 109, resolved: false, paid: false };
  assert.equal(itemActions.useSpecialItem(value, 'tributeWaiverDecree'), null);
  assert.equal(value.specialItems.tributeWaiverDecree, 0);
  assert.equal(value.courtTribute.resolved, true);

  value.specialItems.tributeWaiverDecree = 1;
  value.courtTribute = { year: 1, items: { grain: 1 }, dueDay: 109, resolved: false, paid: false };
  courtTribute.openCourtTributeChoice(value);
  assert.ok(value.pendingChoice.options.some(option => option.id === 'use-waiver-decree'));
  simulation.resolveChoice(value, 'use-waiver-decree');
  assert.equal(value.specialItems.tributeWaiverDecree, 0);
  assert.equal(value.courtTribute.resolved, true);
}

// 모민 방문은 겨울/일반 이민 쿨다운을 무시하되 모달 충돌 시 소모하지 않고, 거절은 명성 손실이 없다.
{
  const value = state();
  value.day = CONFIG.time.seasonDays * 3 + 2;
  value.specialItems.recruitmentNotice = 1;
  const reputation = value.resources.reputation;
  const lastImmigrationDay = value.lastImmigrationDay;
  assert.equal(itemActions.useSpecialItem(value, 'recruitmentNotice'), null);
  assert.equal(value.specialItems.recruitmentNotice, 0);
  assert.equal(value.pendingChoice.kind, 'immigration');
  assert.equal(value.pendingChoice.data.granted, true);
  assert.equal(value.lastImmigrationDay, lastImmigrationDay, '일반 이민 쿨다운을 변경하지 않는다');
  simulation.resolveChoice(value, 'reject');
  assert.equal(value.resources.reputation, reputation);
}
{
  const value = state();
  value.specialItems.recruitmentNotice = 1;
  value.pendingChoice = { kind: 'incident', title: '다른 일', body: '', options: [], data: {} };
  assert.match(itemActions.useSpecialItem(value, 'recruitmentNotice'), /지금은/);
  assert.equal(value.specialItems.recruitmentNotice, 1);
}
{
  const value = state();
  const before = value.residents.filter(resident => resident.alive).length;
  assert.equal(immigration.openGrantedImmigrationChoice(value), true);
  const count = value.pendingChoice.data.count;
  simulation.resolveChoice(value, 'accept');
  assert.equal(value.residents.filter(resident => resident.alive).length, before + count);
}

console.log('court grant consumable tests passed');
