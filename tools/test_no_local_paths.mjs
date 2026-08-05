// 공개 저장소 위생 검사 — 커밋된 파일에 작업자 기계의 절대 경로가 남지 않게 막는다.
//
// 한 번 푸시된 경로는 GitHub 기록에 남아 되돌리기 어렵다. 그래서 `npm run check`에서
// 매번 걸러 낸다. 새 위반이 잡히면 저장소 루트 기준 상대 경로나 `$env:USERPROFILE`
// 같은 환경 변수로 바꾼다.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERNS = [
  {
    id: 'windows-home',
    // C:\Users\<name>\ 또는 C:/Users/<name>/ — USER는 이미 익명화된 자리표시자라 뺀다.
    re: /[A-Za-z]:[\\/]Users[\\/](?!USER[\\/])[A-Za-z0-9_.-]+[\\/]/g,
    hint: '저장소 루트 기준 상대 경로나 $env:USERPROFILE 로 바꾼다',
  },
  {
    id: 'unix-home',
    re: /(?:^|[\s'"`(=])\/(?:home|Users)\/(?!USER\/)[A-Za-z0-9_.-]+\//g,
    hint: '저장소 루트 기준 상대 경로나 $HOME 으로 바꾼다',
  },
];

// 텍스트가 아닌 파일은 건너뛴다.
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.mp3', '.ogg', '.wav',
  '.woff', '.woff2', '.ttf', '.otf', '.pdf', '.zip', '.mp4', '.webm',
]);

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0')
  .filter(Boolean)
  .filter(f => !SKIP_EXT.has(f.slice(f.lastIndexOf('.')).toLowerCase()));

const violations = [];
for (const file of tracked) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (text.includes('\0')) continue; // 바이너리
  for (const { id, re, hint } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const line = text.slice(0, m.index).split('\n').length;
      violations.push({ file, line, id, match: m[0].trim(), hint });
    }
  }
}

// 이 검사 파일 자체의 패턴 정의는 예외다.
const real = violations.filter(v => v.file !== 'tools/test_no_local_paths.mjs');

if (real.length) {
  console.error(`커밋된 파일 ${new Set(real.map(v => v.file)).size}곳에 로컬 절대 경로가 남아 있습니다:\n`);
  for (const v of real.slice(0, 40)) {
    console.error(`  ${v.file}:${v.line}  ${v.match}   → ${v.hint}`);
  }
  if (real.length > 40) console.error(`  ... 외 ${real.length - 40}건`);
  console.error('');
}

assert.equal(real.length, 0, '커밋된 파일에 작업자 기계의 절대 경로가 없어야 한다');
console.log(`no local paths: ${tracked.length}개 추적 파일 검사, 위반 0건`);
