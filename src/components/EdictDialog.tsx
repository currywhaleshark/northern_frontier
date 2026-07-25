// 절목(節目) — 중심지에서 반포하는 시행 세칙 관리 창.
// 계획: docs/DESIGN-2026-07-23-edict-system.md
import {
  activeEdicts, edictChangeBlockReason, edictDaysInEffect, edictHoldDays, edictHoldRemainingDays,
  edictLevel, edictSlotCapacity, edictSlotsUsed, hasEdictClerk, EDICT_DEFS, EDICT_ORDER,
} from '../game/edicts';
import type { EdictId, EdictLevel, GameState } from '../game/types';

interface Props {
  state: GameState;
  onSetEdictLevel: (id: EdictId, level: EdictLevel) => void;
  onClose: () => void;
}

export function EdictDialog({ state, onSetEdictLevel, onClose }: Props) {
  const capacity = edictSlotCapacity(state);
  const used = edictSlotsUsed(state);
  const holdDays = edictHoldDays(state);
  const clerk = hasEdictClerk(state);
  const inEffect = activeEdicts(state);

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="modal edict-dialog" role="dialog" aria-modal="true" aria-labelledby="edict-dialog-title">
        <div className="edict-heading">
          <div>
            <h2 id="edict-dialog-title">절목 (節目)</h2>
            <div className="muted small">
              첨사가 영(令)을 내리면 관아 앞에 방(榜)이 붙습니다 · 시행 중 {used}/{capacity}개
            </div>
          </div>
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>×</button>
        </div>

        <div className="muted small edict-rules">
          한 번 내린 영은 {holdDays}일(한 계절) 지켜야 합니다. 그 안에 뒤집으면 조령모개로 민심과 명성이 상합니다.
          {clerk
            ? ' 관청의 아전이 실무를 맡아 슬롯이 하나 늘고 유지 기간이 절반으로 줄었습니다.'
            : ' 관청을 세우고 아전을 두면 슬롯이 하나 늘고 유지 기간이 짧아집니다.'}
        </div>

        <div className="edict-list">
          {EDICT_ORDER.map(id => {
            const def = EDICT_DEFS[id];
            const current = edictLevel(state, id);
            const days = edictDaysInEffect(state, id);
            const remaining = edictHoldRemainingDays(state, id);
            const currentLevelDef = def.levels.find(level => level.level === current);
            return (
              <section key={id} className="edict-card" aria-label={def.name}>
                <header className="edict-card-head">
                  <strong>{def.name} <span className="muted small">({def.hanja})</span></strong>
                  <span className={current === 'normal' ? 'muted small' : 'small edict-active-tag'}>
                    {current === 'normal'
                      ? '평시'
                      : `${currentLevelDef?.name} · ${days}일째 시행`}
                  </span>
                </header>
                <p className="muted small">{def.desc}</p>
                <div className="action-grid edict-levels" role="group" aria-label={`${def.name} 단계`}>
                  {def.levels.map(levelDef => {
                    const active = levelDef.level === current;
                    const blocked = active ? null : edictChangeBlockReason(state, id, levelDef.level);
                    const whiplash = !active && remaining > 0;
                    return (
                      <button
                        key={levelDef.level}
                        type="button"
                        className={`action-chip${active ? ' active' : ''}`}
                        aria-pressed={active}
                        disabled={active || !!blocked}
                        title={blocked
                          ?? `${levelDef.summary}${whiplash ? ` · 지금 바꾸면 조령모개 (유지 ${remaining}일 남음)` : ''}`}
                        onClick={() => onSetEdictLevel(id, levelDef.level)}
                      >
                        {levelDef.name}
                      </button>
                    );
                  })}
                </div>
                <div className="muted small">
                  {currentLevelDef?.summary}
                  {remaining > 0 && (
                    <span className="edict-hold-note"> · 유지 {remaining}일 남음</span>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {inEffect.length === 0 && (
          <div className="muted small">
            시행 중인 영이 없습니다. 평시에는 지금까지와 똑같이 먹이고 지핍니다.
          </div>
        )}
        {state.day < (state.edictWhiplashUntil ?? 0) && (
          <div className="small edict-whiplash-note">
            조령모개 — 관아의 말을 믿지 못하는 분위기가 {(state.edictWhiplashUntil ?? 0) - state.day}일 더 남았습니다.
          </div>
        )}
      </div>
    </div>
  );
}
