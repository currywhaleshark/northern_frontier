import { withJosa } from '../game/josa';
import {
  BUILDING_DEFS, buildingCostFor, buildingFootprintDims, footprintTilesOf, getBuilding, isBuildingUnlocked,
  isSmithyProductUnlocked, SMITHY_PRODUCT_DEFS, SMITHY_PRODUCT_ORDER, smithyProductOf,
} from '../game/buildings';
import { CONFIG } from '../game/config';
import { FACTIONS, JOB_COLORS, JOB_NAMES, RANK_NAMES, RESOURCE_NAMES } from '../game/constants';
import { allowedCropsForBuilding, cropIdForBuilding, CROP_DEFS } from '../game/crops';
import { edictSlotCapacity, edictSlotsUsed } from '../game/edicts';
import { canRequestTrade, factionTradeUnlockReason } from '../game/events';
import { DRYING_PRODUCT_DEFS, DRYING_PRODUCT_ORDER, dryingProductOf } from '../game/preservation';
import { TANNERY_PRODUCT_DEFS, TANNERY_PRODUCT_ORDER, tanneryProductOf } from '../game/wearables';
import {
  IMPLEMENTED_LIVESTOCK_IDS, LIVESTOCK_DEFS, normalizeLivestockState,
  plotPlowOxenMax, plowOxenAssigned, plowOxenOf, plowOxenPool,
} from '../game/livestock';
import { pastureTileCount, stableLivestockCapacity } from '../game/pastures';
import { bedShare, LIFE_STAGE_NAMES } from '../game/lifecycle';
import { getBuildingActions } from '../game/selectionActions';
import { centerPromotionUpgradeReason, nextRank } from '../game/promotion';
import {
  assignedSlotResidents, availableWorkerSlots, isResidentAvailableForWorkerSlot, workerSlotConfig, workerSlotCount,
} from '../game/workerSlots';
import type { BuildingTypeId, CropId, DryingProductId, GameState, LivestockId, ResourceId, SmithyProductId, TanneryProductId } from '../game/types';
import { BuildingIcon } from './BuildingIcon';
import { FactionName } from './FactionName';
import { LivestockIcon } from './LivestockIcon';
import { UiIcon } from './UiIcon';

const TILE = CONFIG.ui.tileSize;

interface Props {
  state: GameState;
  buildingId: number;
  embedded?: boolean;
  onUpgradeHousing: (buildingId: number, targetType: Extract<BuildingTypeId, 'ondol' | 'tileHouse'>) => void;
  onUpgradeCenter: (buildingId: number) => void;
  onSetSmithyProduct: (buildingId: number, product: SmithyProductId) => void;
  onSetTanneryProduct: (buildingId: number, product: TanneryProductId) => void;
  onSetDryingProduct: (buildingId: number, product: DryingProductId) => void;
  onSetLivestockSpecies: (buildingId: number, species: LivestockId) => void;
  onSlaughterLivestock: (buildingId: number, amount: number) => void;
  onDefinePasture: (buildingId: number) => void;
  onExpandArea: (buildingId: number) => void;
  onStartBuildingDemolition: (buildingId: number) => void;
  onBeginBuildingRelocation: (buildingId: number) => void;
  onTogglePriorityBuilding: (buildingId: number) => void;
  onSetBuildingCrop: (buildingId: number, cropId: CropId, mode: 'queue' | 'uproot') => void;
  onConvertFieldToPaddy: (buildingId: number) => void;
  onSetPlotPlowOxen: (buildingId: number, count: number) => void;
  onRequestTrade: (factionName: string) => void;
  onOpenEdicts: () => void;
  onToggleNitre: () => void;
  onSilverVeinAction: (action: 'break-seal' | 'reopen') => void;
  onAssignNearestWorker: (buildingId: number) => void;
  onUnassignWorker: (residentId: number) => void;
  onSelectResident: (residentId: number) => void;
  onClose: () => void;
}

function CostLine({ type, w = 1, h = 1 }: { type: BuildingTypeId; w?: number; h?: number }) {
  const cost = Object.entries(buildingCostFor(type, w, h))
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([res, amount]) => `${RESOURCE_NAMES[res as ResourceId]} ${amount}`)
    .join(' · ');
  return cost ? <div className="muted small">{cost}</div> : null;
}

export function ActionPopup({
  state,
  buildingId,
  embedded = false,
  onUpgradeHousing,
  onUpgradeCenter,
  onSetSmithyProduct,
  onSetTanneryProduct,
  onSetDryingProduct,
  onSetLivestockSpecies,
  onSlaughterLivestock,
  onDefinePasture,
  onExpandArea,
  onStartBuildingDemolition,
  onBeginBuildingRelocation,
  onTogglePriorityBuilding,
  onSetBuildingCrop,
  onConvertFieldToPaddy,
  onSetPlotPlowOxen,
  onRequestTrade,
  onOpenEdicts,
  onToggleNitre,
  onSilverVeinAction,
  onAssignNearestWorker,
  onUnassignWorker,
  onSelectResident,
  onClose,
}: Props) {
  const building = getBuilding(state, buildingId);
  if (!building) return null;
  const actions = getBuildingActions(state, building);
  const slotConfig = building.built ? workerSlotConfig(building.type) : null;
  const centerTarget = building.type === 'center' ? nextRank(state.rank) : null;
  const centerReason = centerTarget ? centerPromotionUpgradeReason(state, building.id) : null;
  const activeBuildingWork = Boolean(
    !building.built || building.repairing || building.expansion || building.workOrder,
  );
  // 예전에는 특별한 조작이 없는 건물(초가집처럼 슬롯도 액션도 없는 것)에서 아무것도
  // 렌더하지 않아, 이전·해체 버튼까지 같이 사라졌다. 건물을 골랐으면 기본 정보와
  // 버튼은 항상 보여 준다.
  const def = BUILDING_DEFS[building.type];
  const footprint = footprintTilesOf(state, building) ?? [];
  const maxX = Math.max(building.x, ...footprint.map(tile => tile.x));
  const minY = Math.min(building.y, ...footprint.map(tile => tile.y));
  const style = {
    left: (maxX + 1) * TILE + 8,
    top: minY * TILE,
  };
  const slotCount = slotConfig ? workerSlotCount(building) : 0;
  const slotWorkers = slotConfig ? assignedSlotResidents(state, building) : [];
  const openSlots = slotConfig ? availableWorkerSlots(state, building) : 0;
  const isCropBuilding = building.built && (building.type === 'field' || building.type === 'paddy');
  const currentCrop = isCropBuilding ? cropIdForBuilding(building) : null;
  const queuedCrop = isCropBuilding ? building.queuedCropId ?? null : null;
  const hasStandingCrop = isCropBuilding && currentCrop != null && building.fieldGrowth > 0.5;
  const plotDims = isCropBuilding ? buildingFootprintDims(building) : null;
  const plotAreaTiles = plotDims ? plotDims.w * plotDims.h : 0;
  const plotSown = isCropBuilding ? Math.min(plotAreaTiles, Math.max(0, Math.floor(building.sownArea ?? 0))) : 0;
  // 주거 건물은 입주자 명단을 함께 보여 준다. 아이는 어른보다 자리를 덜 차지하므로
  // 정원과 실제 인원이 어긋날 수 있어, 어긋날 때만 차지한 자리 수를 덧붙인다.
  const occupants = def.capacity > 0
    ? state.residents.filter(candidate => candidate.alive && candidate.homeBuildingId === building.id)
    : null;
  const occupantBeds = occupants
    ? occupants.reduce((sum, occupant) => sum + bedShare(occupant), 0)
    : 0;

  return (
    <div className={embedded ? 'selection-building-actions' : 'action-popup'} style={embedded ? undefined : style}>
      {!embedded && (
        <div className="action-popup-head">
          <span><BuildingIcon type={building.type} size={24} /> {def.name}</span>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="닫기">x</button>
        </div>
      )}

      {centerTarget && (
        <div className="worker-slot-panel center-promotion-panel">
          <div className="worker-slot-summary">
            <span>{RANK_NAMES[centerTarget]} 승격</span>
            <span className="muted small">교지 확인</span>
          </div>
          <p className="muted small">
            교지를 받은 뒤 중심지를 업그레이드하면 승격합니다. 교지는 기물함에 영구 보관됩니다.
          </p>
          <button
            className="btn"
            type="button"
            disabled={centerReason != null}
            title={centerReason ?? `${withJosa(RANK_NAMES[centerTarget], '으로/로')} 승격합니다`}
            onClick={() => onUpgradeCenter(building.id)}
          >
            중심지 업그레이드
          </button>
          {centerReason && <div className="muted small">{centerReason}</div>}
        </div>
      )}

      {building.type === 'center' && building.built && (
        <button
          className="action-command"
          type="button"
          title="배급·난방 같은 시행 세칙을 반포합니다"
          onClick={onOpenEdicts}
        >
          <span><UiIcon name="decree" size={20} /> 절목</span>
          <div className="muted small">시행 중 {edictSlotsUsed(state)}/{edictSlotCapacity(state)}개</div>
        </button>
      )}

      {plotDims && (
        <div className="muted small">
          {plotDims.w}×{plotDims.h} 경작지 · 파종 {plotSown}/{plotAreaTiles}칸 · 성장 {Math.round(building.fieldGrowth)}%
        </div>
      )}

      {activeBuildingWork && (
        <button
          className={`action-command${state.priorityBuildingId === building.id ? ' active' : ''}`}
          type="button"
          onClick={() => onTogglePriorityBuilding(building.id)}
          title="담당 일꾼들이 다음 근무일에도 이 작업을 가장 먼저 선택합니다"
        >
          <span>{state.priorityBuildingId === building.id ? '우선 공사 해제' : '우선 공사 지정'}</span>
          <div className="muted small">다음 출근 때도 최우선 작업</div>
        </button>
      )}

      {building.built && building.type !== 'center' && !activeBuildingWork && (
        <div className="action-grid">
          <button
            className="action-chip"
            type="button"
            onClick={() => onBeginBuildingRelocation(building.id)}
            title="건축가가 해체한 뒤 지정한 위치에 자재 비용 없이 다시 짓습니다"
          >
            이전
          </button>
          <button
            className="action-chip danger"
            type="button"
            onClick={() => onStartBuildingDemolition(building.id)}
            title="건축가가 해체를 마치면 건설 자재 일부를 회수합니다"
          >
            해체
          </button>
        </div>
      )}

      {building.built && (building.type === 'field' || building.type === 'paddy' || building.type === 'cemetery') && (() => {
        const dims = buildingFootprintDims(building);
        const area = dims.w * dims.h;
        const maximum = CONFIG.farming.maxPlotSide ** 2;
        const atMaximum = area >= maximum;
        return (
          <button
            className="action-command"
            type="button"
            disabled={atMaximum || building.expansion != null}
            title={atMaximum
              ? `최대 영역 ${CONFIG.farming.maxPlotSide}×${CONFIG.farming.maxPlotSide}칸입니다`
              : building.expansion
                ? '확장 공사 중입니다'
                : `기존 영역에 붙여 최대 ${CONFIG.farming.maxPlotSide}×${CONFIG.farming.maxPlotSide}칸까지 확장합니다`}
            onClick={() => onExpandArea(building.id)}
          >
            <span>영역 확장</span>
            <div className="muted small">{area}/{maximum}칸 · {building.type === 'field' || building.type === 'paddy' ? '농부' : '건축가'} 공사</div>
          </button>
        );
      })()}

      {occupants && (
        <div className="worker-slot-panel">
          <div className="worker-slot-summary">
            <span>입주자</span>
            <span className="muted small">
              {occupants.length}/{building.built ? def.capacity : 0}명
              {occupantBeds > occupants.length ? ` · 자리 ${occupantBeds}` : ''}
            </span>
          </div>
          {occupants.length === 0 && (
            <div className="muted small">아직 아무도 살지 않습니다.</div>
          )}
          {occupants.map(occupant => (
            <div className="worker-slot-row" key={occupant.id}>
              <button
                className="worker-slot-main"
                type="button"
                onClick={() => onSelectResident(occupant.id)}
                title={`${occupant.name} 선택`}
              >
                <span
                  className="worker-slot-dot"
                  style={{ backgroundColor: JOB_COLORS[occupant.job] }}
                />
                <span className="worker-slot-text">
                  <span className="worker-slot-name">{occupant.name}</span>
                  <span className="muted small">
                    {occupant.stage ? LIFE_STAGE_NAMES[occupant.stage] : JOB_NAMES[occupant.job]}
                    {occupant.sick ? ' · 와병' : ''}
                  </span>
                </span>
              </button>
            </div>
          ))}
        </div>
      )}

      {slotConfig && (
        <div className="worker-slot-panel">
          <div className="worker-slot-summary">
            <span>작업 슬롯</span>
            <span className="muted small">{JOB_NAMES[slotConfig.job]} {slotWorkers.length}/{slotCount}</span>
          </div>
          {Array.from({ length: slotCount }, (_value, index) => {
            const worker = slotWorkers[index];
            const workerInactive = worker != null && !isResidentAvailableForWorkerSlot(state, worker);
            const workerStatus = !worker
              ? JOB_NAMES[slotConfig.job]
              : worker.sick
                ? '와병 중 · 생산 중단'
                : state.day < (worker.quarantinedUntil ?? 0)
                  ? '격리 중 · 생산 중단'
                  : worker.health < 20
                    ? '중상 · 생산 중단'
                    : workerInactive
                      ? '근무 불가 · 생산 중단'
                      : JOB_NAMES[worker.job];
            const disabled = !worker && openSlots <= 0;
            return (
              <div
                className={`worker-slot-row${workerInactive ? ' inactive' : ''}${worker ? '' : ' empty'}${disabled ? ' disabled' : ''}`}
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
                    <span className="muted small">{workerStatus}</span>
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

      {isCropBuilding && (() => {
        const oxenMax = plotPlowOxenMax(building);
        const assigned = plowOxenOf(building);
        const pool = plowOxenPool(state);
        const freeOxen = Math.max(0, pool - plowOxenAssigned(state));
        if (oxenMax <= 0 || (pool <= 0 && assigned <= 0)) return null;
        return (
          <div className="worker-slot-panel">
            <div className="worker-slot-summary">
              <span>농우</span>
              <span className="muted small">
                내준 소 {assigned}/{oxenMax}마리 · 남은 소 {freeOxen}마리
              </span>
            </div>
            <div className="action-grid">
              {Array.from({ length: oxenMax + 1 }, (_value, count) => (
                <button
                  key={count}
                  className={`action-chip${assigned === count ? ' active' : ''}`}
                  type="button"
                  disabled={count > assigned + freeOxen}
                  title={count === 0
                    ? '농우를 축사로 돌려보냅니다'
                    : `소 ${count}마리가 쟁기를 끌어 파종·재배·수확이 빨라집니다 (+${Math.round(count * (CONFIG.farming.plowOxWorkMultiplier - 1) * 100)}%)`}
                  onClick={() => onSetPlotPlowOxen(building.id, count)}
                >
                  {count === 0 ? '없음' : `${count}마리`}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {building.type === 'field' && building.built && (
        <button className="action-command" type="button" onClick={() => onConvertFieldToPaddy(building.id)}>
          <span>논으로 전환</span>
          <CostLine type="paddy" w={building.w ?? 1} h={building.h ?? 1} />
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

      {building.type === 'tannery' && (
        <div className="action-grid" role="group" aria-label="무두장 생산 방식">
          {TANNERY_PRODUCT_ORDER.map(product => {
            const productDef = TANNERY_PRODUCT_DEFS[product];
            const active = tanneryProductOf(building) === product;
            const recipe = product === 'auto'
              ? '옷과 신발의 부족분을 비교해 자동 생산'
              : `가죽 ${productDef.hidePerUnit} → ${productDef.name} 1`;
            return (
              <button
                key={product}
                className={`action-chip${active ? ' active' : ''}`}
                type="button"
                title={recipe}
                onClick={() => onSetTanneryProduct(building.id, product)}
              >
                {productDef.name}
              </button>
            );
          })}
        </div>
      )}

      {building.type === 'dryingRack' && (
        <div className="action-grid">
          {DRYING_PRODUCT_ORDER.map(product => {
            const productDef = DRYING_PRODUCT_DEFS[product];
            const active = dryingProductOf(building) === product;
            const recipe = Object.entries(productDef.inputPerUnit)
              .map(([res, amt]) => `${RESOURCE_NAMES[res as ResourceId]} ${amt}`)
              .join(' + ');
            return (
              <button
                key={product}
                className={`action-chip${active ? ' active' : ''}`}
                type="button"
                title={`${recipe}${productDef.stopsInRain ? ' · 비가 오면 생산 중단' : ''}`}
                onClick={() => onSetDryingProduct(building.id, product)}
              >
                {productDef.name}
              </button>
            );
          })}
        </div>
      )}

      {building.type === 'stable' && building.built && (() => {
        const livestock = normalizeLivestockState(building.livestock);
        const pastureTiles = pastureTileCount(building);
        const capacity = stableLivestockCapacity(building, livestock.species);
        return (
          <div className="worker-slot-panel">
            <div className="worker-slot-summary">
              <span>축종</span>
              <span className="muted small"><LivestockIcon species={livestock.species} size={20} /> {LIVESTOCK_DEFS[livestock.species].name} {livestock.headcount}/{capacity}마리</span>
            </div>
            <button
              className="action-command"
              type="button"
              disabled={pastureTiles >= CONFIG.pasture.maxSide ** 2 || building.expansion != null}
              title={`최대 ${CONFIG.pasture.maxSide}×${CONFIG.pasture.maxSide} · 약 ${CONFIG.pasture.tilesPerHerder}칸마다 목동 1명`}
              onClick={() => pastureTiles > 0 ? onExpandArea(building.id) : onDefinePasture(building.id)}
            >
              {pastureTiles > 0
                ? `방목지 확장 (${pastureTiles}/${CONFIG.pasture.maxSide ** 2}칸 · 건축가 공사)`
                : '방목지 지정'}
            </button>
            <div className="action-grid">
              {IMPLEMENTED_LIVESTOCK_IDS.map(species => (
                <button
                  key={species}
                  className={`action-chip${livestock.species === species ? ' active' : ''}`}
                  type="button"
                  disabled={!state.unlockedLivestock.includes(species)}
                  onClick={() => onSetLivestockSpecies(building.id, species)}
                >
                  <LivestockIcon species={species} size={20} /> {LIVESTOCK_DEFS[species].name}
                </button>
              ))}
            </div>
            <button
              className="action-command"
              type="button"
              disabled={livestock.headcount < 1}
              title={`${LIVESTOCK_DEFS[livestock.species].name} 1마리 → 고기 ${CONFIG.livestock[livestock.species].slaughterMeatPerHead}`}
              onClick={() => onSlaughterLivestock(building.id, 1)}
            >
              {LIVESTOCK_DEFS[livestock.species].name} 1마리 도축
            </button>
          </div>
        );
      })()}

      {(building.type === 'market' || building.type === 'dock') && (
        <div className="action-grid">
          {FACTIONS.filter(faction =>
            faction.exports.length > 0 && !factionTradeUnlockReason(state, faction.name)).map(faction => {
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

      {building.type === 'mine' && actions.some(action => action.id === 'silver-break-seal') && (
        <button
          className="action-command"
          type="button"
          title="조정의 봉인을 어기는 잠채입니다. 발각되면 모반 의심이 크게 치솟습니다."
          onClick={() => onSilverVeinAction('break-seal')}
        >
          봉인을 어기고 은맥을 판다
        </button>
      )}

      {building.type === 'mine' && actions.some(action => action.id === 'silver-reopen') && (
        <button
          className="action-command"
          type="button"
          title="묻어둔 은맥의 처분을 다시 정합니다."
          onClick={() => onSilverVeinAction('reopen')}
        >
          묻어둔 은맥을 다시 연다
        </button>
      )}
    </div>
  );
}
