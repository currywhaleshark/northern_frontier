// P0 기준 스크린샷 캡처 — 현행 전술 UI를 두 해상도로 기록한다 (Phase 3 개편 전 기준선)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: node capture_baseline.mjs <outDir>');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5173';

async function clickText(page, text, { exact = false, timeout = 8000 } = {}) {
  const button = exact
    ? page.getByRole('button', { name: text, exact: true }).first()
    : page.locator('button', { hasText: text }).first();
  await button.click({ timeout });
}

async function openSim(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await clickText(page, '전투 시뮬레이션');
  await page.waitForSelector('h1:has-text("전투 시뮬레이션")');
}

async function forceHolaon(page) {
  const faction = page.locator('select').filter({ has: page.locator('option', { hasText: '홀라온 야인' }) }).first();
  await faction.selectOption({ label: '홀라온 야인' });
  await clickText(page, '경보됨', { exact: true });
}

async function shoot(page, name) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, name), fullPage: false });
  console.log('captured', name);
}

async function waitForPhase(page, phase, timeoutMs = 60000) {
  await page.waitForFunction(
    expected => window.__game?.state?.()?.tacticalBattle?.phase === expected,
    phase,
    { timeout: timeoutMs },
  );
}

async function captureDefense(page, tag) {
  await openSim(page);
  await forceHolaon(page);
  await shoot(page, `sim-setup-${tag}.png`);
  await clickText(page, '전투 시작', { exact: true });
  await waitForPhase(page, 'preparation');
  await shoot(page, `defense-preparation-${tag}.png`);
  // 준비 2건 선택 후 실행 → 연출 재생 → 배치 단계
  await clickText(page, '주민 대피');
  await clickText(page, '목책 응급 수리');
  await clickText(page, '선택한 준비 실행');
  await waitForPhase(page, 'deployment', 90000);
  await shoot(page, `defense-deployment-${tag}.png`);
  await clickText(page, '전투 시작', { exact: true });
  await waitForPhase(page, 'command');
  await shoot(page, `defense-command-${tag}.png`);
  // 부대 칩 클릭 → 명령 팝오버
  await page.locator('.tactical-unit-dock button, .tactical-group-chip').first().click().catch(() => {});
  await shoot(page, `defense-command-popover-${tag}.png`);
  await page.keyboard.press('Escape');
  await clickText(page, '교전 개시');
  await page.waitForTimeout(2500);
  await shoot(page, `defense-simulating-${tag}.png`);
  await waitForPhase(page, 'report', 120000);
  await shoot(page, `defense-round-report-${tag}.png`);
}

async function captureHuntDeployment(page, tag) {
  await openSim(page);
  await clickText(page, '늑대 사냥', { exact: true });
  await clickText(page, '전투 시작', { exact: true });
  await waitForPhase(page, 'preparation');
  await clickText(page, '선택한 준비 실행');
  await waitForPhase(page, 'deployment', 90000);
  await shoot(page, `hunt-deployment-${tag}.png`);
}

const browser = await chromium.launch();
for (const [tag, viewport] of [['1280x720', { width: 1280, height: 720 }], ['1920x1080', { width: 1920, height: 1080 }]]) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await captureDefense(page, tag);
  await captureHuntDeployment(page, tag);
  await context.close();
}
await browser.close();
console.log('done');
