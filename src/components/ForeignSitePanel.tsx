import { withJosa } from '../game/josa';
import { FACTIONS, RESOURCE_NAMES } from '../game/constants';
import { CONFIG } from '../game/config';
import { isClaimPermissionActive } from '../game/claimZones';
import { canOpenClaimAccordEnvoy, claimAccordEnvoyRemainingDays, claimAccordRemainingDays } from '../game/diplomacy';
import { SITE_GIFTS, type SiteGiftType } from '../game/siteDiplomacy';
import { foreignSiteFoodDays, foreignSitePartyKindLabel } from '../game/foreignSiteSimulation';
import type { ClaimKind, ForeignSite, ForeignSiteStatus, ForeignSiteType, GameState, ResourceId } from '../game/types';
import { FactionName } from './FactionName';

const TYPE_NAMES: Record<ForeignSiteType, string> = {
  village: '현지 부락',
  fishingVillage: '어로 취락',
  seasonalCamp: '계절 야영지',
  outpost: '감시 전초기지',
  banditLair: '변경 마적 산채',
  ruin: '폐허',
};

const STATUS_NAMES: Record<ForeignSiteStatus, string> = {
  hidden: '미확인',
  stable: '안정',
  prosperous: '풍족',
  hungry: '식량 부족',
  sick: '질병',
  hostile: '적대',
  fortified: '방비 강화',
  abandoned: '버려짐',
  burned: '불탐',
};

const CLAIM_NAMES: Record<ClaimKind, string> = {
  hunting: '사냥터',
  fishing: '어로 구역',
  forest: '숲 이용지',
  field: '경작지 주변',
  sacred: '금기 구역',
  passage: '통행로',
};

interface Props {
  state: GameState;
  site: ForeignSite;
  onSendGift: (siteId: number, gift: SiteGiftType) => void;
  onOpenClaimAccord: (factionName: string, zoneId: number) => void;
  onRequestDefectors: (siteId: number) => void;
  onScoutLair: (siteId: number) => void;
  onRaidLair: (siteId: number) => void;
}

function estimatePopulation(site: ForeignSite): string {
  const low = Math.max(5, Math.floor(site.population / 10) * 10);
  return `${low}~${low + 10}명`;
}

function estimatePower(state: GameState, site: ForeignSite): string {
  if ((site.scoutedUntilDay ?? 0) >= state.day) return `${site.militaryPower} (정찰 확인)`;
  const low = Math.max(5, Math.floor(site.militaryPower / 10) * 10);
  return `${low}~${low + 15} 추정`;
}

export function ForeignSitePanel({
  state, site, onSendGift, onOpenClaimAccord, onRequestDefectors, onScoutLair, onRaidLair,
}: Props) {
  const faction = FACTIONS.find(candidate => candidate.name === site.factionName);
  const zones = state.claimZones.filter(zone => zone.siteId === site.id && zone.discovered);
  const inactive = site.type === 'seasonalCamp' &&
    (site.seasonalActive === false || site.seasonalTransition != null);
  const operational = site.status !== 'burned' && site.status !== 'abandoned';
  const passageActive = zones.some(zone => zone.kind === 'passage' && isClaimPermissionActive(state, zone));
  const activityParties = state.foreignSiteParties.filter(party => party.siteId === site.id);
  const recentProduction = Object.entries(site.activity?.recentProduction ?? {})
    .filter((entry): entry is [string, number] => Number(entry[1]) > 0)
    .map(([resource, amount]) => `${RESOURCE_NAMES[resource as ResourceId] ?? resource} ${amount.toFixed(1)}`)
    .join(' · ');
  const hasLocalEconomy = operational && site.type !== 'banditLair' && site.type !== 'ruin' && site.type !== 'outpost';

  return (
    <div className="foreign-site-panel">
      <div className="foreign-site-heading">
        <div>
          <strong>{site.name}</strong>
          <span>{TYPE_NAMES[site.type]}</span>
        </div>
        <span className="foreign-site-status">{STATUS_NAMES[site.status]}</span>
      </div>

      <div className="muted small foreign-site-description">
        {site.type === 'banditLair'
          ? '산채는 정주 부락이 아니라 국경을 떠도는 무장 무리의 은신처입니다.'
          : '이곳 사람들은 우리가 오기 전부터 강과 숲과 산길을 함께 써 왔습니다.'}
      </div>
      {site.seasonalTransition && (
        <div className="foreign-site-notice">
          {site.seasonalTransition === 'entering' ? '사냥꾼들이 야영지로 들어오는 중입니다.' : '사냥꾼들이 짐을 싣고 떠나는 중입니다.'}
        </div>
      )}
      {inactive && !site.seasonalTransition && <div className="foreign-site-notice">계절이 바뀌어 야영지가 비어 있습니다.</div>}
      {passageActive && (
        <div className="foreign-site-notice">
          산길 개방 · 교역 한도 +{Math.round((CONFIG.foreignSites.passageTradeCapacityMult - 1) * 100)}% · 상단 회전 {CONFIG.foreignSites.passageTradeCooldownReduction}일 단축
        </div>
      )}
      {zones.some(zone => zone.kind === 'passage') && operational && !passageActive && (
        <div className="foreign-site-notice">
          통행 제한 · 일반 이동과 작업은 생활권을 우회하며, 강제 명령은 외교 항의로 이어질 수 있습니다
        </div>
      )}

      <table className="insp-table foreign-site-table">
        <tbody>
          <tr><td>소유</td><td>{site.factionName ? <FactionName name={site.factionName} /> : '주인 없음'}</td></tr>
          <tr><td>인구</td><td>{estimatePopulation(site)}</td></tr>
          <tr><td>군사력</td><td>{estimatePower(state, site)}</td></tr>
          <tr><td>호의 / 신용</td><td>{Math.round(site.goodwill)} / {Math.round(site.trust)}</td></tr>
          <tr><td>경계심 / 은혜</td><td>{Math.round(site.alarm)} / {site.favors}</td></tr>
          {hasLocalEconomy && <tr><td>비축 식량</td><td>약 {Math.floor(foreignSiteFoodDays(site))}일분</td></tr>}
          {hasLocalEconomy && (
            <tr>
              <td>바깥 활동</td>
              <td>{activityParties.length > 0
                ? activityParties.map(party => `${foreignSitePartyKindLabel(party.kind)} ${party.memberCount}명`).join(' · ')
                : inactive ? '야영지 비움' : '거주지에서 쉬는 중'}</td>
            </tr>
          )}
          {hasLocalEconomy && recentProduction && <tr><td>최근 3일 생산</td><td>{recentProduction}</td></tr>}
          {faction && <tr><td>세력색</td><td><span className="foreign-site-color" style={{ background: faction.color }} />{faction.name}</td></tr>}
        </tbody>
      </table>

      {zones.length > 0 && (
        <div className="foreign-site-claims">
          <div className="small muted">확인된 생활권</div>
          {zones.map(zone => {
            const accordDays = claimAccordRemainingDays(state, zone.id);
            const envoyDays = claimAccordEnvoyRemainingDays(state, zone.id);
            const accordReason = site.factionName ? canOpenClaimAccordEnvoy(state, site.factionName, zone.id) : '소속을 확인할 수 없습니다';
            const growth = zone.growth;
            const graceDays = growth?.establishedUseGraceUntilDay == null
              ? 0 : Math.max(0, growth.establishedUseGraceUntilDay - state.day);
            const boundaryState = growth?.pendingChange === 'expand'
              ? '확장 순찰 중'
              : growth?.pendingChange === 'contract'
                ? accordDays != null ? '협정으로 축소 보류' : '다음 계절 축소 예정'
                : (growth?.pressure ?? 0) > 0
                  ? `확장 압력 +${growth?.pressure}`
                  : (growth?.pressure ?? 0) < 0 ? `축소 압력 ${growth?.pressure}` : '경계 안정';
            return (
            <div key={zone.id}>
              <span>{CLAIM_NAMES[zone.kind]} · 반경 {zone.radius}</span>
              <span>{accordDays != null ? `협정 ${accordDays}일` : envoyDays != null ? `사절 ${envoyDays}일` : isClaimPermissionActive(state, zone) ? `${Math.max(0, (zone.permittedUntilDay ?? state.day) - state.day)}일 허락` : '허락 없음'}</span>
              <span title="생활권 경계는 계절마다 한 칸씩만 바뀝니다">{boundaryState}{graceDays > 0 ? ` · 기존 시설 유예 ${graceDays}일` : ''}</span>
              {site.factionName && (
                <button className="btn small" type="button" disabled={inactive || !!accordReason} title={accordReason ?? `은 또는 ${site.factionName}이 받는 물자로 1년 협정을 제안합니다`} onClick={() => onOpenClaimAccord(site.factionName!, zone.id)}>
                  협정 제안
                </button>
              )}
            </div>
            );
          })}
        </div>
      )}

      {site.type !== 'banditLair' && operational && (
        <div className="foreign-site-actions">
          <div className="small muted">예물 보내기</div>
          <div className="foreign-site-gifts">
            {(Object.keys(SITE_GIFTS) as SiteGiftType[]).map(gift => {
              const def = SITE_GIFTS[gift];
              const disabled = inactive || state.resources[def.resource] < def.amount;
              return (
                <button
                  key={gift}
                  className="btn small"
                  type="button"
                  disabled={disabled}
                  title={disabled ? `${withJosa(RESOURCE_NAMES[def.resource], '이/가')} 부족하거나 야영지가 비어 있습니다` : `${withJosa(def.label, '을/를')} 예물로 보냅니다`}
                  onClick={() => onSendGift(site.id, gift)}
                >{def.label}</button>
              );
            })}
          </div>
          <div className="foreign-site-requests">
            {(site.status === 'hungry' || site.status === 'sick') && (
              <button className="btn small" type="button" disabled={inactive} onClick={() => onRequestDefectors(site.id)}>
                귀순 의향 묻기
              </button>
            )}
          </div>
        </div>
      )}

      {site.type === 'banditLair' && operational && (
        <div className="foreign-site-actions foreign-site-lair-actions">
          <button className="btn small" type="button" onClick={() => onScoutLair(site.id)}>산채 정찰</button>
          <button className="btn small danger" type="button" onClick={() => onRaidLair(site.id)}>토벌대 소집</button>
        </div>
      )}

      <div className="small muted foreign-site-memory-title">최근 기억</div>
      {site.memories.length === 0 ? (
        <div className="small muted">아직 오간 약조나 충돌이 없습니다.</div>
      ) : site.memories.slice(0, 3).map((memory, index) => (
        <div key={`${memory.day}-${index}`} className={`foreign-site-memory ${memory.kind}`}>
          <span>{memory.day}일</span>{memory.text}
        </div>
      ))}
    </div>
  );
}
