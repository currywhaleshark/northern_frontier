// 플레이어 조작이 거절될 때 화면 가운데에 띄우는 알림 — 로그만 보면 이유를 놓치기 때문이다.
// 게임 진행이 만드는 로그(사냥·날씨 등)는 대상이 아니다. 클릭에 대한 응답만 띄운다.

export type ActionNoticeTone = 'bad' | 'info' | 'good';

export interface ActionNotice {
  id: number;
  text: string;
  tone: ActionNoticeTone;
  /** 같은 문구를 연달아 거절당하면 새 줄을 쌓지 않고 횟수만 올린다 */
  repeat: number;
  /** 이 알림이 화면에 머무는 시간 (ms) — 사라짐 애니메이션 길이를 CSS와 맞춘다 */
  ttlMs: number;
}

export interface ActionNoticeStore {
  getSnapshot: () => readonly ActionNotice[];
  subscribe: (listener: () => void) => () => void;
  push: (text: string, tone?: ActionNoticeTone) => void;
  dismiss: (id: number) => void;
  clear: () => void;
}

export interface ActionNoticeOptions {
  /** 기본 노출 시간. 긴 문구는 읽을 시간을 조금 더 준다. */
  ttlMs?: number;
  /** 동시에 쌓이는 최대 줄 수 — 넘치면 오래된 것부터 밀어낸다 */
  max?: number;
}

const DEFAULT_TTL_MS = 2600;
const DEFAULT_MAX = 3;
// 문구가 길면 읽는 시간이 더 필요하다 — 글자당 조금씩 늘리되 상한을 둔다.
const TTL_PER_CHAR_MS = 34;
const MAX_TTL_MS = 5200;

export function noticeTtlMs(text: string, baseMs = DEFAULT_TTL_MS): number {
  return Math.min(MAX_TTL_MS, baseMs + Math.max(0, text.length - 20) * TTL_PER_CHAR_MS);
}

export function createActionNoticeStore(options: ActionNoticeOptions = {}): ActionNoticeStore {
  const baseTtlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const max = Math.max(1, options.max ?? DEFAULT_MAX);
  const listeners = new Set<() => void>();
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let notices: readonly ActionNotice[] = [];
  let nextId = 1;

  const emit = (): void => {
    for (const listener of listeners) listener();
  };

  const cancelTimer = (id: number): void => {
    const timer = timers.get(id);
    if (timer != null) clearTimeout(timer);
    timers.delete(id);
  };

  const remove = (id: number): void => {
    cancelTimer(id);
    const next = notices.filter(notice => notice.id !== id);
    if (next.length === notices.length) return;
    notices = next;
    emit();
  };

  const scheduleRemoval = (notice: ActionNotice): void => {
    cancelTimer(notice.id);
    timers.set(notice.id, setTimeout(() => remove(notice.id), notice.ttlMs));
  };

  return {
    getSnapshot: () => notices,
    subscribe: listener => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    push: (text, tone = 'info') => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const ttlMs = noticeTtlMs(trimmed, baseTtlMs);
      const last = notices.length > 0 ? notices[notices.length - 1] : undefined;
      // 같은 거절을 반복하면 줄이 쌓이는 대신 횟수가 올라가고 타이머가 다시 시작된다.
      if (last && last.text === trimmed && last.tone === tone) {
        const bumped: ActionNotice = { ...last, repeat: last.repeat + 1, ttlMs };
        notices = [...notices.slice(0, -1), bumped];
        scheduleRemoval(bumped);
        emit();
        return;
      }
      const notice: ActionNotice = { id: nextId++, text: trimmed, tone, repeat: 1, ttlMs };
      const kept = notices.length >= max ? notices.slice(notices.length - max + 1) : notices;
      for (const dropped of notices.slice(0, notices.length - kept.length)) cancelTimer(dropped.id);
      notices = [...kept, notice];
      scheduleRemoval(notice);
      emit();
    },
    dismiss: remove,
    clear: () => {
      for (const id of timers.keys()) clearTimeout(timers.get(id)!);
      timers.clear();
      if (notices.length === 0) return;
      notices = [];
      emit();
    },
  };
}
