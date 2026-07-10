import {
  BUILDING_DEFS, buildingFootprintTiles, getBuilding, isBuildingUnlocked, isSmithyProductUnlocked, SMITHY_PRODUCT_DEFS,
  SMITHY_PRODUCT_ORDER, smithyProductOf,
} from '../game/buildings';
import { CONFIG } from '../game/config';
import { FACTIONS, JOB_COLORS, JOB_NAMES, RANK_NAMES, RESOURCE_NAMES } from '../game/constants';
import { allowedCropsForBuilding, cropIdForBuilding, CROP_DEFS } from '../game/crops';
import { canRequestTrade } from '../game/events';
import { getBuildingActions } from '../game/selectionActions';
import { assignedWorkers, availableWorkerSlots, workerSlotConfig } from '../game/workerSlots';
import type { BuildingTypeId, CropId, GameState, ResourceId, SmithyProductId } from '../game/types';
import { FactionName } from './FactionName';

const TILE = CONFIG.ui.tileSize;

interface Props {
  state: GameState;
  buildingId: number;
  onUpgradeHousing: (buildingId: number, targetType: Extract<BuildingTypeId, 'ondol' | 'tileHouse'>) => void;
  onSetSmithyProduct: (buildingId: number, product: SmithyProductId) => void;
  onSetBuildingCrop: (buildingId: number, cropId: CropId, mode: 'queue' | 'uproot') => void;
  onConvertFieldToPaddy: (buildingId: number) => void;
  onRequestTrade: (factionName: string) => void;
  onToggleNitre: () => void;
  onAssignNearestWorker: (buildingId: number) => void;
  onUnassignWorker: (residentId: number) => void;
  onSelectResident: (residentId: number) => void;
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
  onSetBuildingCrop,
  onConvertFieldToPaddy,
  onRequestTrade,
  onToggleNitre,
  onAssignNearestWorker,
  onUnassignWorker,
  onSelectResident,
  onClose,
}: Props) {
  const building = getBuilding(state, buildingId);
  if (!building) return null;
  const actions = getBuildingActions(state, building);
  const slotConfig = building.built ? workerSlotConfig(building.type) : null;
  if (actions.length === 0 && !slotConfig) return null;

  const def = BUILDING_DEFS[building.type];
  const footprint = buildingFootprintTiles(state, building.type, building.x, building.y) ?? [];
  const maxX = Math.max(building.x, ...footprint.map(tile => tile.x));
  const minY = Math.min(building.y, ...footprint.map(tile => tile.y));
  const style = {
    left: (maxX + 1) * TILE + 8,
    top: minY * TILE,
  };
  const slotWorkers = slotConfig ? assignedWorkers(state, building) : [];
  const openSlots = slotConfig ? availableWorkerSlots(state, building) : 0;
  const isCropBuilding = building.built && (building.type === 'field' || building.type === 'paddy');
  const currentCrop = isCropBuilding ? cropIdForBuilding(building) : null;
  const queuedCrop = isCropBuilding ? building.queuedCropId ?? null : null;
  const hasStandingCrop = isCropBuilding && currentCrop != null && building.fieldGrowth > 0.5;

  return (
    <div className="action-popup" style={style}>
      <div className="action-popup-head">
        <span>{def.emoji} {def.name}</span>
        <button className="icon-btn" type="button" onClick={onClose} aria-label="닫기">x</button>
      </div>

      {slotConfig && (
        <div className="worker-slot-panel">
          <div className="worker-slot-summary">
            <span>작업 슬롯</span>
            <span className="muted small">{JOB_NAMES[slotConfig.job]} {slotWorkers.length}/{slotConfig.slots}</span>
          </div>
          {Array.from({ length: slotConfig.slots }, (_value, index) => {
            const worker = slotWorkers[index];
            const disabled = !worker && openSlots <= 0;
            return (
              <div
                className={`worker-slot-row${worker ? '' : ' empty'}${disabled ? ' disabled' : ''}`}
                key={worker?.id ?? `empty-${index}`}
              >
                <button
                  className="worker-slot-main"
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (worker) onSelectResident(worker.id);
                    else onAssignNearestWorker(building.id);
                  }}
                  title={worker ? `${worker.name} 선택` : '가까운 일꾼 배정'}
                >
                  <span
                    className="worker-slot-dot"
                    style={worker ? { backgroundColor: JOB_COLORS[worker.job] } : undefined}
                  />
                  <span className="worker-slot-text">
                    <span className="worker-slot-name">{worker ? worker.name : '빈 슬롯 배정'}</span>
                    <span className="muted small">{worker ? JOB_NAMES[worker.job] : JOB_NAMES[slotConfig.job]}</span>
                  </span>
                </button>
                {worker && (
                  <button
                    className="icon-btn worker-slot-unassign"
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      onUnassignWorker(worker.id);
                    }}
                    aria-label={`${worker.name} 배정 해제`}
                    title="배정 해제"
                  >
                    -
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isCropBuilding && (
        <div className="worker-slot-panel">
          <div className="worker-slot-summary">
            <span>작물</span>
            <span className="muted small">
              {currentCrop ? CROP_DEFS[currentCrop].name : '비어 있음'}
              {queuedCrop ? ` -> ${CROP_DEFS[queuedCrop].name}` : ''}
              {' · '}{Math.floor(building.fieldGrowth)}%
            </span>
          </div>
          {hasStandingCrop ? (
            <div style={{ display: 'grid', gap: 4 }}>
              {allowedCropsForBuilding(building.type).map(cropId => {
                const crop = CROP_DEFS[cropId];
                const active = currentCrop === cropId;
                return (
                  <div key={cropId} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 4, alignItems: 'center' }}>
                    <span className="small" title={crop.desc}>{crop.name}{active ? ' 재배 중' : ''}</span>
                    <button
                      className={`action-chip${queuedCrop === cropId ? ' active' : ''}`}
                      type="button"
                      disabled={active}
                      title="현재 작물을 수확한 뒤 바꿉니다"
                      onClick={() => onSetBuildingCrop(building.id, cropId, 'queue')}
                    >
                      예약
                    </button>
                    <button
                      className="action-chip"
                      type="button"
                      title="현재 작물을 갈아엎고 선택합니다"
                      onClick={() => onSetBuildingCrop(building.id, cropId, 'uproot')}
                    >
                      갈아엎기
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="action-grid">
              {allowedCropsForBuilding(building.type).map(cropId => (
                <button
                  key={cropId}
                  className={`action-chip${currentCrop === cropId || queuedCrop === cropId ? ' active' : ''}`}
                  type="button"
                  title={CROP_DEFS[cropId].desc}
                  onClick={() => onSetBuildingCrop(building.id, cropId, 'uproot')}
                >
                  {CROP_DEFS[cropId].name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {building.type === 'field' && building.built && (
        <button className="action-command" type="button" onClick={() => onConvertFieldToPaddy(building.id)}>
          <span>논으로 전환</span>
          <CostLine type="paddy" />
        </button>
      )}

      {building.type === 'hut' && isBuildingUnlocked(state.rank, 'ondol') && (
        <button className="action-command" type="button" onClick={() => onUpgradeHousing(building.id, 'ondol')}>
          <span>온돌집으로 개량</span>
          <CostLine type="ondol" />
        </button>
      )}

      {building.type === 'ondol' && isBuildingUnlocked(state.rank, 'tileHouse') && (
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
          {FACTIONS.filter(faction => faction.exports.length > 0).map(faction => {
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
