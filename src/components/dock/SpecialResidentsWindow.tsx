import { JOB_NAMES } from '../../game/constants';
import {
  SPECIAL_RESIDENT_ROSTER,
} from '../../game/specialResidents';
import type { GameState, SpecialResidentId } from '../../game/types';
import { UiIcon } from '../UiIcon';

interface Props {
  state: GameState;
  selectedResidentId: number | null;
  onSelectResident: (residentId: number) => void;
  onAppointConfined: (id: SpecialResidentId) => void;
}

export function SpecialResidentsWindow({
  state,
  selectedResidentId,
  onSelectResident,
  onAppointConfined,
}: Props) {
  const records = state.specialResidentRecords ?? {};
  const encountered = SPECIAL_RESIDENT_ROSTER.filter(definition =>
    state.spentSpecialIds?.includes(definition.id)
      || records[definition.id]
      || state.residents.some(resident => resident.special === definition.id),
  );

  return (
    <div className="special-resident-window">
      <div className="panel-title">사연 있는 주민 명부</div>
      <p className="small muted">
        특수 주민은 하나의 직업에만 종사하며, 강한 능력과 지속적인 부담을 함께 가져옵니다.
      </p>
      {encountered.length === 0 ? (
        <div className="special-resident-empty">아직 이 변방에 이름을 남긴 인연이 없습니다.</div>
      ) : encountered.map(definition => {
        const resident = state.residents.find(candidate => candidate.special === definition.id);
        const record = records[definition.id];
        const active = Boolean(resident?.alive);
        const confined = record?.status === 'confined';
        const dead = record?.status === 'dead' || Boolean(resident && !resident.alive);
        const pending = state.pendingChoice?.kind === 'specialResident'
          && state.pendingChoice.data.special === definition.id;
        const status = active
          ? `활동 중 · ${JOB_NAMES[resident!.job]}${record?.originFaction ? ` · ${record.originFaction} 출신` : ''}`
          : dead
            ? definition.id === 'mudang' || definition.id === 'nosung'
              ? '사망 · 후계 전승'
              : '사망 · 대체 불가'
            : confined
              ? `안치 중 · ${record.availableUntilDay}일까지 등용 가능`
              : pending
                ? '처우를 결정하는 중'
                : '이탈 · 다시 오지 않음';
        return (
          <article
            key={definition.id}
            className={`special-resident-card${resident?.id === selectedResidentId ? ' selected' : ''}`}
          >
            <header>
              <span className="special-resident-badge"><UiIcon name={definition.badge} size={28} /></span>
              <div>
                <strong>{definition.name}</strong>
                <span>{definition.epithet}</span>
              </div>
            </header>
            <div className={`special-resident-status${active ? ' active' : ''}`}>{status}</div>
            <p>{definition.story}</p>
            <dl>
              {(definition.skills?.length ?? 0) > 0 ? (
                <div>
                  <dt>특기</dt>
                  <dd className="special-skill-list">
                    {definition.skills!.map(skill => (
                      <div key={skill.id} className="special-skill-row">
                        <span className="special-skill-chip">
                          <UiIcon name={skill.icon} size={18} /> {skill.name}
                        </span>
                        <span className="special-skill-effect">{skill.effect}</span>
                      </div>
                    ))}
                  </dd>
                </div>
              ) : (
                <div><dt>능력</dt><dd>{definition.benefit}</dd></div>
              )}
              <div><dt>부담</dt><dd>{definition.risk}</dd></div>
            </dl>
            <div className="special-resident-actions">
              {active && resident && (
                <button type="button" className="btn small" onClick={() => onSelectResident(resident.id)}>
                  지도에서 찾기
                </button>
              )}
              {confined && (
                <button type="button" className="btn small" onClick={() => onAppointConfined(definition.id)}>
                  관아에 등용
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
