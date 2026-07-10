import type { ResourceId } from '../game/types';

export interface ResourceBreakdownItem {
  id: ResourceId;
  label: string;
  amount: number;
}

interface Props {
  title: string;
  items: ResourceBreakdownItem[];
  pinned: boolean;
  onTogglePinned: () => void;
}

export function ResourceBreakdownPopover({ title, items, pinned, onTogglePinned }: Props) {
  return (
    <div className="resource-breakdown-popover" role="dialog" aria-label={`${title} 상세 재고`}>
      <div className="resource-breakdown-head">
        <strong>{title}</strong>
        <button
          className={`icon-btn${pinned ? ' active' : ''}`}
          type="button"
          title={pinned ? '목록 고정 해제' : '목록 고정'}
          aria-pressed={pinned}
          onClick={event => {
            event.stopPropagation();
            onTogglePinned();
          }}
        >
          {pinned ? '●' : '○'}
        </button>
      </div>
      {items.map(item => (
        <div key={item.id} className="resource-breakdown-row">
          <span>{item.label}</span>
          <span>{item.amount.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}
