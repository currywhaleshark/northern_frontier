import { BUILDING_DEFS, BUILD_MENU_ORDER } from '../game/buildings';
import { JOB_MIN_RANK, JOB_NAMES, JOB_ORDER, RANK_NAMES } from '../game/constants';
import type { PromotionRank } from '../game/promotion';
import { BuildingIcon } from './BuildingIcon';

interface Props {
  rank: PromotionRank;
  onAcknowledge: () => void;
}

const PROMOTION_COPY: Record<PromotionRank, { title: string; body: string; duty: string }> = {
  bo: {
    title: '개척지가 보(堡)가 되었습니다',
    body: '조정의 교지에 따라 중심지를 군사 거점의 격식에 맞게 고쳐 세웠습니다.',
    duty: '사람과 물자가 더 모이는 만큼 세공과 국경 방비의 부담도 커집니다.',
  },
  jin: {
    title: '보가 진(鎭)으로 승격했습니다',
    body: '넓힌 중심지에 새 현판을 걸고 변경 방어의 지휘 체계를 갖추었습니다.',
    duty: '조정의 기대와 주민의 생활 기준이 높아지고 더 강한 위협이 고을을 주시합니다.',
  },
  bu: {
    title: '진이 마침내 부(府)가 되었습니다',
    body: '큰 고을의 관아로 거듭난 중심지에 관리와 장부가 모이고 개척의 대업이 완성되었습니다.',
    duty: '부의 행정과 교역 시설을 활용해 승리 이후에도 개척을 이어갈 수 있습니다.',
  },
};

export function PromotionModal({ rank, onAcknowledge }: Props) {
  const copy = PROMOTION_COPY[rank];
  const buildings = BUILD_MENU_ORDER.filter(type => BUILDING_DEFS[type].minRank === rank);
  const jobs = JOB_ORDER.filter(job => JOB_MIN_RANK[job] === rank);

  return (
    <div className="modal-overlay promotion-modal-overlay">
      <section className="modal promotion-modal" role="dialog" aria-modal="true" aria-labelledby="promotion-modal-title">
        <div className="promotion-modal-seal" aria-hidden="true">陞</div>
        <span className="muted small">조정 교지에 따른 중심지 개축 완료</span>
        <h2 id="promotion-modal-title">{copy.title}</h2>
        <p>{copy.body}</p>

        <div className="promotion-unlock-section">
          <h3>새로 해금된 건물</h3>
          <div className="promotion-unlock-grid">
            {buildings.map(type => (
              <div key={type} className="promotion-unlock-item">
                <BuildingIcon type={type} size={28} />
                <strong>{BUILDING_DEFS[type].name}</strong>
              </div>
            ))}
          </div>
        </div>

        {jobs.length > 0 && (
          <div className="promotion-unlock-section">
            <h3>새로 해금된 직업</h3>
            <div className="promotion-unlock-grid compact">
              {jobs.map(job => <div key={job} className="promotion-unlock-item"><strong>{JOB_NAMES[job]}</strong></div>)}
            </div>
          </div>
        )}

        <p className="promotion-new-duty"><strong>{RANK_NAMES[rank]}의 책무</strong>{copy.duty}</p>
        <button type="button" className="btn primary" onClick={onAcknowledge}>새 현판을 걸다</button>
      </section>
    </div>
  );
}
