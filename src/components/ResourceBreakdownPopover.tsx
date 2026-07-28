import { withJosa } from '../game/josa';
import type { StockResourceId } from '../ui/resourceDisplay';
import { MAX_STARRED_RESOURCES } from '../ui/uiPrefs';
import { ResourceIcon } from './TradeResourceIcon';
import { UiIcon } from './UiIcon';

export interface ResourceBreakdownItem {
  id: StockResourceId;
  label: string;
  amount: number;
  spoilagePerDay?: number;
  low: boolean;
  starred: boolean;
}

interface Props {
  id: string;
  title: string;
  items: ResourceBreakdownItem[];
  pinned: boolean;
  starLimitReached: boolean;
  onTogglePinned: () => void;
  onToggleStarred: (resource: StockResourceId) => void;
}

function formatSpoilagePerDay(value: number): string {
  return value < 0.1 ? value.toFixed(2) : value.toFixed(1);
}

export function ResourceBreakdownPopover({
  id,
  title,
  items,
  pinned,
  starLimitReached,
  onTogglePinned,
  onToggleStarred,
}: Props) {
  return (
    <div id={id} className="resource-breakdown-popover" role="dialog" aria-label={`${title} 상세 재고`}>
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
        <div key={item.id} className={`resource-breakdown-row${item.low ? ' low' : ''}`}>
          <span className="resource-breakdown-label">
            <ResourceIcon resource={item.id} size={20} />
            {item.label}
          </span>
          <span className="resource-breakdown-actions">
            <span>{item.amount.toFixed(1)}</span>
            {item.spoilagePerDay !== undefined && item.spoilagePerDay > 0 && (
              <small
                className="muted"
                title={`${item.label} 예상 일일 부패량`}
              >부패 중 -{formatSpoilagePerDay(item.spoilagePerDay)}/일</small>
            )}
            <button
              className={`resource-star-button${item.starred ? ' active' : ''}`}
              type="button"
              title={item.starred
                ? `${item.label} 별표 해제`
                : starLimitReached
                  ? `별표는 최대 ${MAX_STARRED_RESOURCES}개까지 표시할 수 있습니다`
                  : `${withJosa(item.label, '을/를')} 상단바에 표시`}
              aria-label={item.starred ? `${item.label} 별표 해제` : `${item.label} 별표 추가`}
              aria-pressed={item.starred}
              disabled={!item.starred && starLimitReached}
              onClick={event => {
                event.stopPropagation();
                onToggleStarred(item.id);
              }}
            >
              <UiIcon
                name="important"
                size={18}
                className={item.starred ? '' : 'resource-star-inactive'}
              />
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
