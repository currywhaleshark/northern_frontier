// 밸런스 오버레이 코드젠 — data/balance-overrides.json을 읽어
// src/game/balanceOverrides.ts 하나로 굽는다.
//
// 사용법:
//   node tools/balance-studio/generate_balance_overrides.mjs
//   node tools/balance-studio/generate_balance_overrides.mjs --no-validate   (기본값 트리 대조 생략)
//
// 게임은 생성된 TS만 읽는다. 런타임에 JSON을 fetch하지 않는다.
// 없는 경로·형 불일치·차단 키가 JSON에 있으면 **에러로 중단**한다 —
// 오타가 조용히 무시되면 편집기가 "고쳤다"고 말하는데 게임은 안 바뀐다.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { balanceBlockReason } from './balance-meta.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const DATA = join(HERE, 'data', 'balance-overrides.json');
const OUT = join(ROOT, 'src', 'game', 'balanceOverrides.ts');

const skipValidation = process.argv.includes('--no-validate');

function fail(message) {
  console.error(`[balance-studio] ${message}`);
  process.exit(1);
}

// ── 읽기 ───────────────────────────────────────────────────────────────

function readOverrides() {
  if (!existsSync(DATA)) return {};
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(DATA, 'utf8'));
  } catch (error) {
    fail(`balance-overrides.json 파싱 실패: ${error.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('balance-overrides.json은 "경로 키 → 값" 객체여야 한다');
  }
  const { _comment: _ignored, ...rest } = parsed;
  return rest;
}

const overrides = readOverrides();

for (const [key, value] of Object.entries(overrides)) {
  if (!/^[A-Za-z_$][\w$]*(?:\.[\w$]+)*$/.test(key)) {
    fail(`잘못된 경로 키 "${key}" — 점으로 이은 식별자여야 한다 (예: "minerals.nearbyStone")`);
  }
  if (typeof value !== 'number' && typeof value !== 'boolean') {
    fail(`"${key}"의 값이 숫자·불린이 아니다 (${JSON.stringify(value)})`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    fail(`"${key}"의 값이 유한한 숫자가 아니다`);
  }
  const blocked = balanceBlockReason(key);
  if (blocked) fail(`"${key}"는 차단 목록에 있다 — ${blocked}`);
}

// ── 기본값 트리 대조 ────────────────────────────────────────────────────
// src/game/*.ts를 임시 폴더로 transpile해 실제 기본값을 읽는다 (게임 테스트 하니스와 같은 수법).
// 오버레이가 비면 대조할 것이 없으므로 건너뛴다 — 저장 왕복이 그만큼 빨라진다.

function compileGameModules(ts) {
  const srcDir = join(ROOT, 'src', 'game');
  const outDir = mkdtempSync(join(tmpdir(), 'northern-balance-'));
  for (const file of readdirSync(srcDir).filter(name => name.endsWith('.ts'))) {
    const source = readFileSync(join(srcDir, file), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
      (/\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`));
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

function resolveDefault(root, path) {
  let node = root;
  for (const segment of path) {
    if (node === null || typeof node !== 'object') return undefined;
    node = node[segment];
  }
  return node;
}

async function validateAgainstDefaults() {
  const ts = (await import('typescript')).default;
  const outDir = compileGameModules(ts);
  try {
    const config = await import(pathToFileURL(join(outDir, 'config.mjs')).href);
    const buildings = await import(pathToFileURL(join(outDir, 'buildings.mjs')).href);
    for (const [key, value] of Object.entries(overrides)) {
      const isBuilding = key.startsWith('buildings.');
      const root = isBuilding ? buildings.BUILDING_DEF_DEFAULTS : config.CONFIG_DEFAULTS;
      const path = (isBuilding ? key.slice('buildings.'.length) : key).split('.');
      const current = resolveDefault(root, path);
      if (current === undefined) {
        fail(`"${key}"는 기본값 트리에 없는 경로다 (오타이거나 config.ts에서 사라진 키)`);
      }
      if (typeof current !== typeof value) {
        fail(`"${key}"의 형이 기본값과 다르다 (기본값 ${typeof current}, 오버레이 ${typeof value})`);
      }
      if (current === value) {
        console.warn(`[balance-studio] 알림: "${key}"는 기본값과 같다 — 지워도 되는 항목이다`);
      }
    }
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

if (!skipValidation && Object.keys(overrides).length > 0) {
  await validateAgainstDefaults();
}

// ── 출력 ───────────────────────────────────────────────────────────────

const sorted = Object.keys(overrides).sort((a, b) => a.localeCompare(b));
const body = sorted.length === 0
  ? '{}'
  : `{\n${sorted.map(key => `  ${JSON.stringify(key)}: ${JSON.stringify(overrides[key])},`).join('\n')}\n}`;

const out = `// 이 파일은 tools/balance-studio/generate_balance_overrides.mjs가 생성한다. 직접 수정하지 말 것.
// 편집 원본은 tools/balance-studio/data/balance-overrides.json이며, 밸런스 편집기(npm run edit:balance)에서 고친다.
//
// 경로 키 → 값. 접두사 없는 키는 CONFIG, \`buildings.\`로 시작하는 키는 BUILDING_DEFS를 가리킨다.
// 기본값과 같아진 키는 편집기가 지우므로, 여기 남은 것은 전부 "기본값에서 벗어난 값"이다.
import type { BalanceOverrideValue } from './balanceOverlay';

export const BALANCE_OVERRIDES: Readonly<Record<string, BalanceOverrideValue>> = ${body};
`;

writeFileSync(OUT, out, 'utf8');
console.log(`[balance-studio] ${OUT} 생성 완료 — 오버레이 ${sorted.length}개`);
