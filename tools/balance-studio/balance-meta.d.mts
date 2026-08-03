// balance-meta.mjs의 타입 선언 — 편집기 앱(TS)이 같은 파일을 import하기 위한 것.
export type BalanceTiming = 'runtime' | 'worldgen' | 'saved';

export interface BalanceBlockRule {
  readonly id: string;
  readonly reason: string;
  readonly test: (path: string) => boolean;
}

export interface BalanceTimingRule {
  readonly timing: BalanceTiming;
  readonly test: (path: string) => boolean;
}

export declare const STUDIO_OWNED_SLOT_BUILDINGS: readonly string[];
export declare const BALANCE_BLOCK_RULES: readonly BalanceBlockRule[];
export declare function balanceBlockReason(path: string): string | null;
export declare const BALANCE_TIMINGS: Readonly<Record<BalanceTiming, { readonly label: string; readonly hint: string }>>;
export declare const BALANCE_TIMING_RULES: readonly BalanceTimingRule[];
export declare function balanceTiming(path: string): BalanceTiming;
export declare function balanceValueWarning(
  defaultValue: number | boolean,
  value: number | boolean,
): string | null;
