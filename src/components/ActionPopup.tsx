import {
  BUILDING_DEFS, buildingFootprintTiles, getBuilding, isSmithyProductUnlocked, SMITHY_PRODUCT_DEFS,
  SMITHY_PRODUCT_ORDER, smithyProductOf,
} from '../game/buildings';
import { CONFIG } from '../game/config';
import { FACTIONS, RANK_NAMES, RESOURCE_NAMES } from '../game/constants';
import { canRequestTrade } from '../game/events';
import { getBuildingActions } from '../game/selectionActions';
import type { BuildingTypeId, GameState, ResourceId, SmithyProductId } from '../game/types';
import { FactionName } from './FactionName';

const TILE = CONFIG.ui.tileSize;

interface Props {
  state: GameState;
  buildingId: number;
  onUpgradeHousing: (buildingId: number, targetType: Extract<BuildingTypeId, 'ondol' | 'tileHouse'>) => void;
  onSetSmithyProduct: (buildingId: number, product: SmithyProductId) => void;
  onRequestTrade: (factionName: string) => void;
  onToggleNitre: () => void;
  onClose: () => void;
}

function CostLine({ type }: { type: BuildingTypeId }) {
  const cost = Object.entries(BUILDING_DEFS[type].cost)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([res, amount]) => `${RESOURCE_NAMES[res as ResourceId]} ${amount}`)
    .join(' · ');
  return cost ? <div className="muted small">{cost}</div> : null;
}

export function ActionPopup({
  state,
  buildingId,
  onUpgradeHousing,
  onSetSmithyProduct,
  onRequestTrade,
  onToggleNitre,
  onClose,
}: Props) {
  const building = getBuilding(state, buildingId);
  if (!building) return null;
  const actions = getBuildingActions(state, building);
  if (actions.length === 0) return null;

  const def = BUILDING_DEFS[building.type];
  const footprint = buildingFootprintTiles(state, building.type, building.x, building.y) ?? [];
  const maxX = Math.max(building.x, ...footprint.map(tile => tile.x));
  const minY = Math.min(building.y, ...footprint.map(tile => tile.y));
  const style = {
    left: (maxX + 1) * TILE + 8,
    top: minY * TILE,
  };

  return (
    <div className="action-popup" style={style}>
      <div className="action-popup-head">
        <span>{def.emoji} {def.name}</span>
        <button className="icon-btn" type="button" onClick={onClose} aria-label="닫기">x</button>
      </div>

      {building.type === 'hut' && (
        <button className="action-command" type="button" onClick={() => onUpgradeHousing(building.id, 'ondol')}>
          <span>온돌집으로 개량</span>
          <CostLine type="ondol" />
        </button>
      )}

      {building.type === 'ondol' && (
        <button className="action-command" type="button" onClick={() => onUpgradeHousing(building.id, 'tileHouse')}>
          <span>기와집으로 개량</span>
          <CostLine type="tileHouse" />
        </button>
      )}

      {building.type === 'smithy' && (
        <div className="action-grid">
          {SMITHY_PRODUCT_ORDER.map(product => {
            const productDef = SMITHY_PRODUCT_DEFS[product];
            const active = smithyProductOf(building) === product;
            const unlocked = isSmithyProductUnlocked(state.rank, product);
            const recipe = Object.entries(productDef.inputPerUnit)
              .map(([res, amt]) => `${RESOURCE_NAMES[res as ResourceId]} ${amt}`)
              .join(' + ');
            return (
              <button
                key={product}
                className={`action-chip${active ? ' active' : ''}`}
                type="button"
                disabled={!unlocked}
                title={unlocked ? recipe : `${RANK_NAMES[productDef.minRank ?? 'bo']} 승격 후 생산`}
                onClick={() => onSetSmithyProduct(building.id, product)}
              >
                {productDef.name}
              </button>
            );
          })}
        </div>
      )}

      {(building.type === 'market' || building.type === 'dock') && (
        <div className="action-grid">
          {FACTIONS.filter(faction => faction.trades.length > 0).map(faction => {
            const reason = canRequestTrade(state, faction.name);
            return (
              <button
                key={faction.name}
                className="action-chip"
                type="button"
                disabled={!!reason}
                title={reason ?? `${faction.name}에 먼저 거래를 청합니다`}
                onClick={() => onRequestTrade(faction.name)}
              >
                <FactionName name={faction.name} />
              </button>
            );
          })}
        </div>
      )}

      {building.type === 'nitreYard' && (
        <button className="action-command" type="button" onClick={onToggleNitre}>
          {state.nitrePaused ? '염초장 가동 재개' : '염초장 가동 중지'}
        </button>
      )}
    </div>
  );
}
