// 이 파일은 tools/balance-studio/generate_balance_overrides.mjs가 생성한다. 직접 수정하지 말 것.
// 편집 원본은 tools/balance-studio/data/balance-overrides.json이며, 밸런스 편집기(npm run edit:balance)에서 고친다.
//
// 경로 키 → 값. 접두사 없는 키는 CONFIG, `buildings.`로 시작하는 키는 BUILDING_DEFS를 가리킨다.
// 기본값과 같아진 키는 편집기가 지우므로, 여기 남은 것은 전부 "기본값에서 벗어난 값"이다.
import type { BalanceOverrideValue } from './balanceOverlay';

export const BALANCE_OVERRIDES: Readonly<Record<string, BalanceOverrideValue>> = {};
