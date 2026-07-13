import { FACTIONS, RESOURCE_NAMES } from '../game/constants';
import { CONFIG } from '../game/config';
import { isClaimPermissionActive } from '../game/claimZones';
import { SITE_GIFTS, type SiteGiftType } from '../game/siteDiplomacy';
import type { ClaimKind, ForeignSite, ForeignSiteStatus, ForeignSiteType, GameState } from '../game/types';
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
  onRequestPassage: (siteId: number) => void;
  onRequestHunting: (siteId: number) => void;
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
  state, site, onSendGift, onRequestPassage, onRequestHunting, onScoutLair, onRaidLair,
}: Props) {
  const faction = FACTIONS.find(candidate => candidate.name === site.factionName);
  const zones = state.claimZones.filter(zone => zone.siteId === site.id && zone.discovered);
  const inactive = site.type === 'seasonalCamp' && site.seasonalActive === false;
  const operational = site.status !== 'burned' && site.status !== 'abandoned';
  const hasPassage = zones.some(zone => zone.kind === 'passage');
  const passageActive = zones.some(zone => zone.kind === 'passage' && isClaimPermissionActive(state, zone));
  const hasHunting = zones.some(zone => zone.kind === 'hunting' || zone.kind === 'forest');

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
      {inactive && <div className="foreign-site-notice">계절이 바뀌어 야영지가 비어 있습니다.</div>}
      {passageActive && (
        <div className="foreign-site-notice">
          산길 개방 · 교역 한도 +{Math.round((CONFIG.foreignSites.passageTradeCapacityMult - 1) * 100)}% · 상단 회전 {CONFIG.foreignSites.passageTradeCooldownReduction}일 단축
        </div>
      )}
      {hasPassage && operational && !passageActive && (
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
          {faction && <tr><td>세력색</td><td><span className="foreign-site-color" style={{ background: faction.color }} />{faction.name}</td></tr>}
        </tbody>
      </table>

      {zones.length > 0 && (
        <div className="foreign-site-claims">
          <div className="small muted">확인된 생활권</div>
          {zones.map(zone => (
            <div key={zone.id}>
              <span>{CLAIM_NAMES[zone.kind]}</span>
              <span>{isClaimPermissionActive(state, zone) ? `${zone.permittedUntilDay! - state.day}일 허락` : '허락 없음'}</span>
            </div>
          ))}
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
                  title={disabled ? `${RESOURCE_NAMES[def.resource]}이(가) 부족하거나 야영지가 비어 있습니다` : `${def.label}을(를) 예물로 보냅니다`}
                  onClick={() => onSendGift(site.id, gift)}
                >{def.label}</button>
              );
            })}
          </div>
          <div className="foreign-site-requests">
            {hasPassage && <button className="btn small" type="button" disabled={inactive} onClick={() => onRequestPassage(site.id)}>통행 허락 청하기</button>}
            {hasHunting && <button className="btn small" type="button" disabled={inactive} onClick={() => onRequestHunting(site.id)}>사냥터 사용 청하기</button>}
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
