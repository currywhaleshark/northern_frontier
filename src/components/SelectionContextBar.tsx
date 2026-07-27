import { BUILDING_DEFS, cemeteryPlotCapacity, getBuilding } from '../game/buildings';
import { isJobUnlocked, JOB_NAMES, JOB_ORDER, RESOURCE_NAMES, TERRAIN_NAMES } from '../game/constants';
import { cropIdForBuilding, CROP_DEFS } from '../game/crops';
import { CONFIG } from '../game/config';
import { haulerCarryCapacity } from '../game/equipment';
import { isExplored } from '../game/exploration';
import { familyReferenceName } from '../game/family';
import { foreignSiteAt } from '../game/foreignSites';
import { mineralRemaining } from '../game/minerals';
import { mineMineralSummary } from '../game/miningSites';
import { livestockCapacityForStable, livestockDailyFeedNeed, LIVESTOCK_DEFS, normalizeLivestockState } from '../game/livestock';
import { pastureRequiredHerders, pastureTileCount } from '../game/pastures';
import { residentHome } from '../game/residents';
import { getSeason } from '../game/seasons';
import { spoilagePreview } from '../game/spoilage';
import { isBuriedSilverVeinTile } from '../game/silver';
import type { SiteGiftType } from '../game/siteDiplomacy';
import { combatDefaultWeaponName } from '../game/combatCapabilities';
import { enrolledStudentIds, isSchoolAge, schoolSeatCount } from '../game/education';
import { specialResidentSkills } from '../game/specialResidents';
import { isYouthWorkJob } from '../game/youth';
import { DAY_BAND_NAMES, uiDayBand } from '../ui/dayBand';
import { COMBAT_WEAPON_NAMES, MOUNT_NAMES } from '../game/weapons';
import type {
  BuildingTypeId,
  CropId,
  DryingProductId,
  GameState,
  JobId,
  LivestockId,
  Resident,
  ResourceId,
  SelectedEntity,
  SmithyProductId,
  YouthActivity,
} from '../game/types';
import { ActionPopup } from './ActionPopup';
import { BuildingIcon } from './BuildingIcon';
import { ForeignSitePanel } from './ForeignSitePanel';
import { LivestockIcon } from './LivestockIcon';
import { UiIcon } from './UiIcon';

interface Props {
  state: GameState;
  selected: { x: number; y: number } | null;
  selectedEntity: SelectedEntity | null;
  onClear: () => void;
  onSetResidentJob: (id: number, job: JobId) => void;
  onSetYouthActivity: (id: number, activity: YouthActivity) => void;
  onToggleResidentCart: (id: number) => void;
  onUpgradeHousing: (buildingId: number, targetType: Extract<BuildingTypeId, 'ondol' | 'tileHouse'>) => void;
  onUpgradeCenter: (buildingId: number) => void;
  onSetSmithyProduct: (buildingId: number, product: SmithyProductId) => void;
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
  onCancelBuildingConstruction: (buildingId: number) => void;
  onSendSiteGift: (siteId: number, gift: SiteGiftType) => void;
  onRequestSitePassage: (siteId: number) => void;
  onRequestSiteHunting: (siteId: number) => void;
  onRequestSiteDefectors: (siteId: number) => void;
  onScoutBanditLair: (siteId: number) => void;
  onRaidBanditLair: (siteId: number) => void;
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="bar-outer">
      <div className="bar-inner" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

function ResidentContext({ state, resident, onSetJob, onToggleCart, onSetYouthActivity }: {
  state: GameState;
  resident: Resident;
  onSetJob: (job: JobId) => void;
  onToggleCart: () => void;
  onSetYouthActivity: (activity: YouthActivity) => void;
}) {
  const home = resident.alive ? residentHome(state, resident) : null;
  const enrolled = isSchoolAge(resident) && enrolledStudentIds(state).has(resident.id);
  const youthActivity = resident.youthActivity === 'school' ? 'school' : 'work';
  const activeSchoolSeats = schoolSeatCount(state);
  return (
    <table className="insp-table">
      <tbody>
        <tr><td>이름</td><td>{resident.name} ({resident.age}세){resident.literate ? <span title="문해자 — 의원·아전·훈장을 맡을 수 있고 숙련이 빨리 오릅니다"> <UiIcon name="literate" size={18} /></span> : ''}{resident.sick ? <span title="환자"> <UiIcon name="sick" size={18} /></span> : ''}{state.day < (resident.quarantinedUntil ?? 0) ? ' · 격리' : ''}</td></tr>
        {resident.origin && <tr><td>출신</td><td>{resident.origin}</td></tr>}
        {resident.spouseId != null && (
          <tr><td>배우자</td><td>{familyReferenceName(state, resident.spouseId, undefined)}</td></tr>
        )}
        {(resident.stage || resident.motherId != null || resident.motherName) && (
          <tr><td>어머니</td><td>{familyReferenceName(state, resident.motherId, resident.motherName)}</td></tr>
        )}
        {(resident.stage || resident.fatherId != null || resident.fatherName) && (
          <tr><td>아버지</td><td>{familyReferenceName(state, resident.fatherId, resident.fatherName)}</td></tr>
        )}
        {resident.stage === 'youth' && (
          <tr>
            <td>소년기 활동</td>
            <td>
              <div role="group" aria-label="소년기 활동 선택">
                <button
                  type="button"
                  className="btn small"
                  aria-pressed={youthActivity === 'work'}
                  onClick={() => onSetYouthActivity('work')}
                >일 돕기</button>{' '}
                <button
                  type="button"
                  className="btn small"
                  aria-pressed={youthActivity === 'school'}
                  onClick={() => onSetYouthActivity('school')}
                >서당 다니기</button>
              </div>
              <small className="muted">
                {youthActivity === 'work'
                  ? '성인 노동력의 50% · 운반꾼·농부·장작패기·목동만 가능'
                  : enrolled
                    ? '서당 가동 · 교육 진행 중'
                    : activeSchoolSeats <= 0
                      ? '진행 정지 — 완공된 서당과 건강한 훈장이 필요합니다.'
                      : '진행 정지 — 서당 정원이 찼습니다.'}
              </small>
            </td>
          </tr>
        )}
        {isSchoolAge(resident) && (
          <tr>
            <td>글공부</td>
            <td>
              {enrolled
                ? `취학 중 · ${Math.floor(resident.education ?? 0)}/${CONFIG.education.schoolDaysForAdultBonus}일`
                : `배운 날 ${Math.floor(resident.education ?? 0)}/${CONFIG.education.schoolDaysForAdultBonus}일`}
              {resident.stage === 'youth' && (
                <small className="muted"> · 성인 시 아전·훈장 초기 숙련 {Math.round(CONFIG.education.schoolAdultSkillBonus * 100)}%</small>
              )}
            </td>
          </tr>
        )}
        {resident.special && specialResidentSkills(resident.special).length > 0 && (
          <tr>
            <td>특기</td>
            <td className="special-skill-cell">
              {specialResidentSkills(resident.special).map(skill => (
                <span key={skill.id} className="special-skill-chip" title={skill.effect}>
                  <UiIcon name={skill.icon} size={18} /> {skill.name}
                </span>
              ))}
            </td>
          </tr>
        )}
        <tr>
          <td>직업</td>
          <td>
            <select
              value={resident.job}
              disabled={!resident.alive || (!!resident.stage && (resident.stage !== 'youth' || youthActivity !== 'work'))}
              title={resident.stage === 'youth' && youthActivity === 'school'
                ? '서당에 다니는 동안 생산 직무를 맡을 수 없습니다'
                : resident.stage && resident.stage !== 'youth' ? '아직 직업을 맡을 수 없는 나이입니다' : undefined}
              onChange={event => onSetJob(event.target.value as JobId)}
            >
              {JOB_ORDER.filter(job => job === resident.job || (isJobUnlocked(state.rank, job)
                && (resident.stage !== 'youth' || isYouthWorkJob(job)))).map(job => (
                <option key={job} value={job}>{JOB_NAMES[job]}</option>
              ))}
            </select>
          </td>
        </tr>
        {resident.alive && resident.job === 'hauler' && (
          <tr>
            <td>운반 장비</td>
            <td>
              <span>{resident.cartEquipped && <><UiIcon name="cart" size={20} /> </>}{resident.cartEquipped ? '수레' : '지게'} · 적재 {haulerCarryCapacity(resident)}</span>{' '}
              <button
                type="button"
                className="btn small"
                disabled={!resident.cartEquipped && state.resources.carts < 1}
                title={resident.cartEquipped
                  ? '짐을 기본 적재량 이하로 내린 뒤 수레를 마을에 반납합니다'
                  : `마을 수레 ${Math.floor(state.resources.carts)}대`}
                onClick={onToggleCart}
              >
                {resident.cartEquipped ? '반납' : '수레 장비'}
              </button>
            </td>
          </tr>
        )}
        {resident.alive && (resident.job === 'militia' || resident.job === 'watchman' || resident.job === 'hunter') && (
          <>
            <tr>
              <td>전투 무기</td>
              <td>{state.weaponAssignments[resident.id]
                ? COMBAT_WEAPON_NAMES[state.weaponAssignments[resident.id]!]
                : `${combatDefaultWeaponName(resident.job)} (기본 무장)`}</td>
            </tr>
            <tr><td>탑승</td><td>{state.mountAssignments[resident.id] ? MOUNT_NAMES[state.mountAssignments[resident.id]!] : '도보'}</td></tr>
          </>
        )}
        <tr><td>현재 작업</td><td>{DAY_BAND_NAMES[uiDayBand(state.subTick)]} · {resident.task}</td></tr>
        {resident.alive && (
          <tr>
            <td>주거</td>
            <td>{home
              ? <><BuildingIcon type={home.type} size={22} /> {BUILDING_DEFS[home.type].name} ({home.x}, {home.y})</>
              : '노숙'}</td>
          </tr>
        )}
        <tr><td>위치</td><td>({resident.x}, {resident.y})</td></tr>
        {Object.keys(resident.carrying).length > 0 && (
          <tr>
            <td>{resident.cartEquipped ? '수레 짐' : '지게 짐'}</td>
            <td>
              {Object.entries(resident.carrying)
                .map(([resource, amount]) => `${RESOURCE_NAMES[resource as ResourceId]} ${(amount ?? 0).toFixed(1)}`)
                .join(', ')}
            </td>
          </tr>
        )}
        <tr><td>배고픔</td><td><Bar value={resident.hunger} color="#d9a441" /></td></tr>
        <tr><td>체온</td><td><Bar value={resident.warmth} color="#7ab3d9" /></td></tr>
        <tr><td>건강</td><td><Bar value={resident.health} color="#6fbf73" /></td></tr>
        <tr><td>사기</td><td><Bar value={resident.morale} color="#b58ad9" /></td></tr>
        <tr><td>숙련도</td><td>{((resident.skills[resident.job] ?? 0) * 100).toFixed(0)}%</td></tr>
      </tbody>
    </table>
  );
}

export function SelectionContextBar({
  state,
  selected,
  selectedEntity,
  onClear,
  onSetResidentJob,
  onSetYouthActivity,
  onToggleResidentCart,
  onUpgradeHousing,
  onUpgradeCenter,
  onSetSmithyProduct,
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
  onCancelBuildingConstruction,
  onSendSiteGift,
  onRequestSitePassage,
  onRequestSiteHunting,
  onRequestSiteDefectors,
  onScoutBanditLair,
  onRaidBanditLair,
}: Props) {
  if (!selectedEntity) return null;

  const tile = selected ? state.map[selected.y]?.[selected.x] : null;
  const explored = tile ? isExplored(state, tile.x, tile.y) : false;
  const building = selectedEntity.kind === 'building' ? getBuilding(state, selectedEntity.id) : undefined;
  const foreignSite = tile && explored && selectedEntity.kind === 'tile'
    ? foreignSiteAt(state, tile.x, tile.y)
    : null;
  const resident = selectedEntity.kind === 'resident'
    ? state.residents.find(candidate => candidate.id === selectedEntity.id) ?? null
    : null;
  const spoilage = spoilagePreview(state);
  const mineSummary = building?.type === 'mine' ? mineMineralSummary(state, building) : null;
  const buriedSilverVeinHere = isBuriedSilverVeinTile(state, tile ?? { x: -1, y: -1 });

  if (resident) {
    const jobName = JOB_NAMES[resident.job];
    const summary = resident.task === jobName ? jobName : `${jobName} · ${resident.task}`;
    return (
      <section className="selection-context-bar" aria-label={`${resident.name} 선택 정보`}>
        <header className="selection-context-head">
          <div><strong>{resident.name}</strong><span>{summary}</span></div>
          <button type="button" aria-label="선택 해제" title="선택 해제" onClick={onClear}>×</button>
        </header>
        <div className="selection-context-body">
          <ResidentContext
            state={state}
            resident={resident}
            onSetJob={job => onSetResidentJob(resident.id, job)}
            onSetYouthActivity={activity => onSetYouthActivity(resident.id, activity)}
            onToggleCart={() => onToggleResidentCart(resident.id)}
          />
        </div>
      </section>
    );
  }

  if (!tile) return null;

  const title = foreignSite
    ? foreignSite.name
    : building
      ? BUILDING_DEFS[building.type].name
      : explored ? TERRAIN_NAMES[tile.terrain] : '미답사 지역';

  return (
    <section className="selection-context-bar" aria-label={`${title} 선택 정보`}>
      <header className="selection-context-head">
        <div><strong>{building && <><BuildingIcon type={building.type} size={24} /> </>}{title}</strong><span>({tile.x}, {tile.y})</span></div>
        <button type="button" aria-label="선택 해제" title="선택 해제" onClick={onClear}>×</button>
      </header>
      <div className="selection-context-body">
        {foreignSite ? (
          <ForeignSitePanel
            state={state}
            site={foreignSite}
            onSendGift={onSendSiteGift}
            onRequestPassage={onRequestSitePassage}
            onRequestHunting={onRequestSiteHunting}
            onRequestDefectors={onRequestSiteDefectors}
            onScoutLair={onScoutBanditLair}
            onRaidLair={onRaidBanditLair}
          />
        ) : (
          <div className="selection-context-layout">
            <div className="selection-context-info">
              <table className="insp-table">
                <tbody>
                  <tr><td>위치</td><td>({tile.x}, {tile.y})</td></tr>
                  {!explored ? (
                    <>
                      <tr><td>상태</td><td>미답사</td></tr>
                      <tr><td colSpan={2} className="muted small">주민이 가까이 가면 지형과 자원을 확인할 수 있습니다.</td></tr>
                    </>
                  ) : (
                    <>
                      <tr><td>지형</td><td>{TERRAIN_NAMES[tile.terrain]}{tile.terrain === 'rock' && tile.hasIron ? ' (철맥)' : ''}</td></tr>
                      {buriedSilverVeinHere && (
                        <tr>
                          <td>은맥</td>
                          <td>
                            묻어 둠 · 은 매장량 {Math.round(state.silverVein?.discoveredAmount ?? 0)} 고정 ·{' '}
                            {mineralRemaining(tile) > 0 ? `원광 ${mineralRemaining(tile).toFixed(1)} 남음` : '원광 고갈'} · 채광장에서 다시 열 수 있음
                          </td>
                        </tr>
                      )}
                      {tile.terrain === 'rock' && building?.type !== 'mine' && (
                        <tr>
                          <td>광상</td>
                          <td>{mineralRemaining(tile) > 0
                            ? `${tile.hasIron ? '철 ' : '석재 '}${mineralRemaining(tile).toFixed(1)} 남음`
                            : '고갈'}</td>
                        </tr>
                      )}
                      {mineSummary && (
                        <>
                          <tr>
                            <td>작업 반경</td>
                            <td>반경 {CONFIG.minerals.mineWorkRadius}칸 · 광상 {mineSummary.deposits}곳</td>
                          </tr>
                          <tr>
                            <td>주변 매장량</td>
                            <td>{[
                              mineSummary.stone > 0 ? `석재 ${mineSummary.stone.toFixed(1)}` : '',
                              mineSummary.iron > 0 ? `철 ${mineSummary.iron.toFixed(1)}` : '',
                              mineSummary.silver > 0 ? `은 ${mineSummary.silver.toFixed(1)}` : '',
                            ].filter(Boolean).join(' · ') || '고갈'}</td>
                          </tr>
                        </>
                      )}
                      {tile.terrain === 'forest' && state.habitats.some(habitat =>
                        habitat.active && (habitat.x - tile.x) ** 2 + (habitat.y - tile.y) ** 2 <= habitat.radius ** 2) && (
                        <tr><td>서식지</td><td><UiIcon name="habitat" size={20} /> 짐승 서식지 범위 (사냥 가능)</td></tr>
                      )}
                      {building && (() => {
                        const def = BUILDING_DEFS[building.type];
                        const occupants = state.residents.filter(candidate =>
                          candidate.alive && candidate.homeBuildingId === building.id);
                        const cropId = building.type === 'field' || building.type === 'paddy'
                          ? cropIdForBuilding(building)
                          : null;
                        return (
                          <>
                            <tr><td>건물</td><td><BuildingIcon type={building.type} size={22} /> {def.name}</td></tr>
                            <tr><td>상태</td><td>{building.workOrder
                              ? `${building.workOrder.kind === 'demolish'
                                ? '해체 중'
                                : building.workOrder.phase === 'dismantling' ? '이전 해체 중' : '이전 재건축 중'} ${Math.floor((building.workOrder.progress / Math.max(1, building.workOrder.required)) * 100)}%`
                              : building.built
                                ? building.expansion
                                ? `영역 확장 중 ${Math.floor((building.expansion.progress / Math.max(1, building.expansion.required)) * 100)}% · ${building.type === 'field' || building.type === 'paddy' ? '농부' : '건축가'}`
                                : '완공'
                              : `${building.repairing ? '수리 중' : '건설 중'} ${Math.floor((building.progress / Math.max(1, def.buildDays)) * 100)}%`}</td></tr>
                            {state.priorityBuildingId === building.id && (
                              <tr><td>공사 순위</td><td>최우선</td></tr>
                            )}
                            {def.capacity > 0 && (
                              <tr><td>입주</td><td>{occupants.length}/{building.built ? def.capacity : 0}명</td></tr>
                            )}
                            {building.type === 'cellar' && building.built && (
                              <tr>
                                <td>저장 보호</td>
                                <td>
                                  {spoilage.protectedTotal.toFixed(1)}/{spoilage.rawFoodTotal.toFixed(1)}
                                  {' '}· 총 용량 {spoilage.capacity}
                                </td>
                              </tr>
                            )}
                            {building.type === 'cemetery' && building.built && (() => {
                              const graveCount = Math.max(0, building.graves ?? 0);
                              const graveCapacity = cemeteryPlotCapacity(building);
                              const records = Array.from({ length: graveCount }, (_, index) => building.burialRecords?.[index] ?? {});
                              return (
                                <>
                                  <tr><td>묘 자리</td><td>{graveCount}/{graveCapacity}기 · {building.w ?? 2}×{building.h ?? 2}칸</td></tr>
                                  <tr>
                                    <td>안치 기록</td>
                                    <td>{records.length > 0
                                      ? records.map((record, index) => (
                                        <div key={`${record.corpseId ?? 'unknown'}-${index}`} className="burial-record">
                                          <strong>{typeof record.name === 'string' && record.name.trim() ? record.name : '미상'}</strong>
                                          <span>사인 {typeof record.cause === 'string' && record.cause.trim() ? record.cause : '미상'} · 사망 {Number.isFinite(record.deathDay) ? `${record.deathDay}일` : '미상'}</span>
                                        </div>
                                      ))
                                      : <span className="muted">안치 기록 없음</span>}</td>
                                  </tr>
                                </>
                              );
                            })()}
                            {(building.type === 'field' || building.type === 'paddy') && building.built && (
                              <>
                                <tr>
                                  <td>작물</td>
                                  <td>{cropId
                                    ? `${CROP_DEFS[cropId].name}${building.queuedCropId ? ` → ${CROP_DEFS[building.queuedCropId].name}` : ''}`
                                    : building.queuedCropId ? `${CROP_DEFS[building.queuedCropId].name} 예약` : '미선택'}</td>
                                </tr>
                                <tr><td>성장</td><td><Bar value={building.fieldGrowth} color="#6fbf73" /></td></tr>
                              </>
                            )}
                            {building.type === 'stable' && building.built && (() => {
                              const livestock = normalizeLivestockState(building.livestock);
                              const season = getSeason(state.day);
                              const feedConfig = CONFIG.livestock[livestock.species];
                              const seasonalGrazer = feedConfig.grazesOutsideWinter;
                              const feedNeed = livestockDailyFeedNeed(livestock, seasonalGrazer ? 'winter' : season);
                              return (
                                <>
                                  <tr><td>축종</td><td><LivestockIcon species={livestock.species} size={20} /> {LIVESTOCK_DEFS[livestock.species].name}</td></tr>
                                  <tr><td>마릿수</td><td>{livestock.headcount}/{livestockCapacityForStable(building, livestock.species)}마리</td></tr>
                                  <tr>
                                    <td>방목지</td>
                                    <td>{building.pasture
                                      ? `${building.pasture.w}×${building.pasture.h} · ${pastureTileCount(building)}칸 · 목동 ${pastureRequiredHerders(building)}명`
                                      : '미지정 · 기존 축사 수용량'}</td>
                                  </tr>
                                  <tr><td>번식</td><td><Bar value={livestock.growth * 100} color="#c99a4a" /></td></tr>
                                  <tr>
                                    <td>사료</td>
                                    <td>
                                      {seasonalGrazer && season !== 'winter' ? '방목 · 겨울 ' : ''}
                                      {feedConfig.feedResource === 'hay' ? '건초' : '곡물'} {feedNeed.toFixed(2)}/일
                                      {livestock.feedShortageDays > 0 ? ` · ${livestock.feedShortageDays}일째 부족` : ''}
                                    </td>
                                  </tr>
                                </>
                              );
                            })()}
                            {building.type === 'jangdokdae' && building.built && (
                              <tr>
                                <td>숙성</td>
                                <td>
                                  {(building.fermentBatches?.length ?? 0) > 0
                                    ? building.fermentBatches!.map((batch, index) => {
                                      const duration = batch.kind === 'jang'
                                        ? CONFIG.fermentation.jangMaturationDays
                                        : CONFIG.fermentation.kimchiMaturationDays;
                                      const remaining = Math.max(0, batch.readyOnDay - state.day);
                                      const progress = Math.max(0, Math.min(100, ((duration - remaining) / duration) * 100));
                                      return (
                                        <div key={`${batch.kind}-${batch.readyOnDay}-${index}`} style={{ display: 'grid', gap: 2, marginBottom: 3 }}>
                                          <span>{batch.kind === 'jang' ? '장' : '김치'} {batch.amount.toFixed(0)} · {remaining}일 남음</span>
                                          <Bar value={progress} color="#9b6b3f" />
                                        </div>
                                      );
                                    })
                                    : '비어 있음 · 늦가을~초겨울에 담금'}
                                </td>
                              </tr>
                            )}
                            {building.inventory && Object.values(building.inventory).some(amount => (amount ?? 0) > 0.05) && (
                              <tr>
                                <td>현장 재고</td>
                                <td>{Object.entries(building.inventory)
                                  .filter((entry): entry is [string, number] => (entry[1] ?? 0) > 0.05)
                                  .map(([resource, amount]) => `${RESOURCE_NAMES[resource as ResourceId]} ${amount.toFixed(1)}`)
                                  .join(', ')}</td>
                              </tr>
                            )}
                            {!building.built && !building.repairing && !building.workOrder && (
                              <tr>
                                <td>건설</td>
                                <td>
                                  <button
                                    className="btn small"
                                    type="button"
                                    onClick={() => {
                                      if (window.confirm(`${def.name} 건설을 취소할까요? 투입 자재는 모두 반환됩니다.`)) {
                                        onCancelBuildingConstruction(building.id);
                                      }
                                    }}
                                  >건설 취소</button>
                                </td>
                              </tr>
                            )}
                            <tr><td colSpan={2} className="muted small">{def.desc}</td></tr>
                          </>
                        );
                      })()}
                    </>
                  )}
                </tbody>
              </table>
            </div>
            {building && (
              <ActionPopup
                embedded
                state={state}
                buildingId={building.id}
                onUpgradeHousing={onUpgradeHousing}
                onUpgradeCenter={onUpgradeCenter}
                onSetSmithyProduct={onSetSmithyProduct}
                onSetDryingProduct={onSetDryingProduct}
                onSetLivestockSpecies={onSetLivestockSpecies}
                onSlaughterLivestock={onSlaughterLivestock}
                onDefinePasture={onDefinePasture}
                onExpandArea={onExpandArea}
                onStartBuildingDemolition={onStartBuildingDemolition}
                onBeginBuildingRelocation={onBeginBuildingRelocation}
                onTogglePriorityBuilding={onTogglePriorityBuilding}
                onSetBuildingCrop={onSetBuildingCrop}
                onConvertFieldToPaddy={onConvertFieldToPaddy}
                onSetPlotPlowOxen={onSetPlotPlowOxen}
                onRequestTrade={onRequestTrade}
                onOpenEdicts={onOpenEdicts}
                onToggleNitre={onToggleNitre}
                onSilverVeinAction={onSilverVeinAction}
                onAssignNearestWorker={onAssignNearestWorker}
                onUnassignWorker={onUnassignWorker}
                onSelectResident={onSelectResident}
                onClose={onClear}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
