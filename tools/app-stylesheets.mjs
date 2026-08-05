import { readFileSync } from 'node:fs';

/**
 * 앱이 실제로 불러오는 스타일시트를 main.tsx의 import 순서대로 이어 붙인다.
 * 셀렉터 존재 여부를 확인하는 테스트는 파일이 어느 쪽으로 갈렸는지 신경 쓰지 않아도 된다.
 */
export function readAppCss() {
  return ['global.css', 'tactical.css']
    .map(name => readFileSync(new URL(`../src/styles/${name}`, import.meta.url), 'utf8'))
    .join('\n');
}
