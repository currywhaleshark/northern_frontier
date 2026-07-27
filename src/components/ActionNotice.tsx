// 조작이 거절된 이유를 화면 가운데에 띄운다 — 모달 위에도 보여야 하고, 지도 클릭을 먹지 않아야 한다.
import { useSyncExternalStore, type CSSProperties } from 'react';
import type { ActionNoticeStore } from '../ui/actionNotices';

interface Props {
  store: ActionNoticeStore;
}

export function ActionNoticeLayer({ store }: Props) {
  const notices = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  if (notices.length === 0) return null;
  return (
    <div className="action-notice-layer" role="status" aria-live="polite">
      {notices.map(notice => (
        <div
          // 같은 문구가 반복되면 key가 바뀌며 다시 마운트된다 — 등장 애니메이션이 새로 튄다.
          key={`${notice.id}:${notice.repeat}`}
          className={`action-notice ${notice.tone}`}
          style={{ '--notice-ms': `${notice.ttlMs}ms` } as CSSProperties}
        >
          <span>{notice.text}</span>
          {notice.repeat > 1 && <b className="action-notice-repeat">×{notice.repeat}</b>}
        </div>
      ))}
    </div>
  );
}
