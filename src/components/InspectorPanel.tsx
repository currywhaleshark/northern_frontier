// 지도 선택 정보와 분리된 전역 사건·기물함 관리 창.
import { availablePredatorScouts, predatorScoutDuration } from '../game/expeditionIntel';
import { SPECIAL_ITEM_DEFS } from '../game/specialItems';
import { predatorHuntChance } from '../game/specialEvents';
import type { GameState, SpecialItemId, WildlifeKind } from '../game/types';
import { UiIcon } from './UiIcon';

interface Props {
  state: GameState;
  onOrganizeHunt: (kind: WildlifeKind) => void;
  onScoutPredator: (kind: 'wolf' | 'tiger', residentId: number) => void;
}

export function InspectorPanel({ state, onOrganizeHunt, onScoutPredator }: Props) {
  const threats = (['wolf', 'tiger', 'boar'] as const)
    .map(kind => state.incidents.predatorThreats[kind])
    .filter(threat => threat != null);
  const itemIds = Object.keys(SPECIAL_ITEM_DEFS) as SpecialItemId[];
  const discovered = itemIds.filter(item => state.discoveredSpecialItems.includes(item));

  return (
    <div className="incident-panel">
      <div className="panel-title">활성 위험</div>
      {threats.length === 0 ? (
        <div className="muted small">현재 추적 중인 맹수가 없습니다.</div>
      ) : threats.map(threat => {
        const kind = threat.kind;
        const tiger = kind === 'tiger';
        const boar = kind === 'boar';
        const scouts = boar ? [] : availablePredatorScouts(state);
        const intel = threat.intel;
        const success = Math.round(predatorHuntChance(state, kind) * 100);
        const successLabel = boar || intel?.precision === 'exact'
          ? `${success}%`
          : intel?.precision === 'rough'
            ? `약 ${Math.round(success / 5) * 5}%`
            : '???';
        return (
          <div key={kind} className={`incident-threat ${tiger ? 'danger' : 'warn'}`}>
            <div>
              <strong>{tiger ? '호랑이 출몰' : boar ? '멧돼지 출몰' : '늑대 출몰'}</strong>
              <span>{Math.max(1, threat.untilDay - state.day)}일 남음</span>
            </div>
            <div className="muted small">
              {tiger ? '낮에는 숲, 밤에는 모든 주민이 위험' : boar ? '밤마다 농작물과 저장 식량이 위험' : '숲에 드나드는 주민이 위험'}
            </div>
            <div className="incident-hunt-row">
              <span>예상 성공 {successLabel}</span>
              <button className="btn small" type="button" onClick={() => onOrganizeHunt(kind)}>
                {boar ? '토벌 준비' : '즉시 토벌'}
              </button>
            </div>
            {!boar && (
              <div className="incident-scout-box">
                {threat.scouting ? (
                  <div>
                    <strong>흔적 추적 중</strong>
                    <span>
                      {state.residents.find(resident => resident.id === threat.scouting?.residentId)?.name ?? '사냥꾼'} ·
                      {' '}{Math.max(0, threat.scouting.completesOnDay - state.day)}일 남음
                    </span>
                  </div>
                ) : (
                  <>
                    <div>
                      <strong>규모 정보 {intel?.precision === 'exact' ? '정확' : intel?.precision === 'rough' ? '대략' : '???'}</strong>
                      <span>{intel ? '더 숙련된 사냥꾼으로 재추적할 수 있습니다.' : '사냥꾼을 며칠간 보내 흔적을 쫓습니다.'}</span>
                    </div>
                    {intel?.precision !== 'exact' && (
                      <select
                        defaultValue=""
                        aria-label={`${tiger ? '호랑이' : '늑대'} 흔적을 쫓을 사냥꾼`}
                        disabled={scouts.length === 0}
                        onChange={event => {
                          const residentId = Number(event.target.value);
                          if (residentId) onScoutPredator(kind, residentId);
                          event.currentTarget.value = '';
                        }}
                      >
                        <option value="">{scouts.length > 0 ? '사냥꾼 선택…' : '파견 가능 사냥꾼 없음'}</option>
                        {scouts.map(scout => {
                          const skill = scout.skills.hunter ?? 0;
                          const days = predatorScoutDuration(
                            skill,
                            (state.specialItems.gyrfalcon ?? 0) > 0,
                            state.residents.some(resident => resident.alive && resident.special === 'tigerHunter'),
                          );
                          return <option key={scout.id} value={scout.id}>{scout.name} · 숙련 {Math.round(skill * 100)}% · {days}일</option>;
                        })}
                      </select>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      {state.incidents.plagueCase && (
        <div className="incident-threat warn">
          <div><strong>역병 의심 환자 관찰</strong><span>{Math.max(1, state.incidents.plagueCase.resolvesOnDay - state.day)}일 남음</span></div>
          <div className="muted small">{state.incidents.plagueCase.isolated ? '격리 중: 배정은 유지되지만 작업 중단' : '미격리: 실제 역병이면 후속 확산 사건 발생'}</div>
        </div>
      )}
      {state.incidents.epidemic && (
        <div className="incident-threat danger">
          <div><strong>역병 유행</strong><span>환자 {state.incidents.epidemic.infectedIds.length}명</span></div>
          <div className="muted small">{state.incidents.epidemic.mode === 'isolated' ? '환자 전원 격리 중' : state.incidents.epidemic.mode === 'pending' ? '대응 결정 대기 중' : '격리 없이 전염 중'}</div>
        </div>
      )}

      <div className="panel-title" style={{ marginTop: 10 }}>기물함</div>
      {discovered.length === 0 ? (
        <div className="muted small">아직 얻은 기물이 없습니다.</div>
      ) : discovered.map(item => {
        const def = SPECIAL_ITEM_DEFS[item];
        return (
          <div key={item} className="special-item-row" title={def.desc}>
            <span className="special-item-icon"><UiIcon name={def.icon} size={28} /></span>
            <div>
              <strong>{def.name}</strong>
              <span className="muted small">{def.inventoryNote}</span>
            </div>
            <b>{state.specialItems[item]}</b>
          </div>
        );
      })}
      {state.tributeWaivers > 0 && (
        <div className="special-item-row tribute-waiver-row">
          <span className="special-item-icon" aria-hidden="true">免</span>
          <div><strong>세공 면제권</strong><span className="muted small">겨울 세공 수거 때 자동 사용</span></div>
          <b>{state.tributeWaivers}</b>
        </div>
      )}
    </div>
  );
}
