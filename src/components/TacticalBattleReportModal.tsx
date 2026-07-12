import { BUILDING_DEFS } from '../game/buildings';
import { RESOURCE_NAMES } from '../game/constants';
import type { ResourceId, TacticalBattleReport } from '../game/types';

interface Props {
  report: TacticalBattleReport;
  onClose: () => void;
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${value}`;
}

function outcomeTone(outcome: TacticalBattleReport['outcome']): string {
  if (outcome === 'defenseSuccess') return 'victory';
  if (outcome === 'partialLoss') return 'costly';
  return 'defeat';
}

export function TacticalBattleReportModal({ report, onClose }: Props) {
  const loot = Object.entries(report.loot).filter(([, amount]) => (amount ?? 0) > 0);
  return (
    <div className="battle-report-overlay" role="dialog" aria-modal="true" aria-label="상세 전투 장계">
      <article className="battle-report-modal">
        <header className="battle-report-header">
          <div>
            <span>전투 장계</span>
            <h2>{report.factionName} 습격 방어전</h2>
            <p>{report.date} · {report.mode === 'levy' ? '민병 방어' : '수비병 요격'} · {report.warned ? '사전 경보' : '기습 대응'}</p>
          </div>
          <button type="button" className="battle-report-close" onClick={onClose} title="장계 닫기" aria-label="장계 닫기">×</button>
        </header>

        <div className={`battle-report-outcome ${outcomeTone(report.outcome)}`}>
          <strong>{report.outcomeLabel}</strong>
          <span>{report.rounds}개 라운드 · 최종 기세 아군 {report.villageMorale}, 적 {report.raiderMorale}</span>
        </div>

        <div className="battle-report-totals">
          <div><span>아군 동원</span><strong>{report.defendersCommitted}명</strong></div>
          <div><span>아군 전사</span><strong>{report.killed.length}명</strong></div>
          <div><span>아군 부상</span><strong>{report.wounded.length}명</strong></div>
          <div><span>적 병력</span><strong>{report.raidersCommitted}명</strong></div>
          <div><span>적 처치</span><strong>{report.raidersKilled}명</strong></div>
          <div><span>적 도주</span><strong>{report.raidersEscaped}명</strong></div>
        </div>

        <div className="battle-report-body">
          <section className="battle-report-section friendly">
            <h3>아군 피해</h3>
            <div className="battle-report-subsection">
              <strong>전사자</strong>
              {report.killed.length > 0 ? (
                <ul>{report.killed.map(person => <li key={person.residentId}><b>{person.name}</b><span>{person.groupLabel}</span></li>)}</ul>
              ) : <p>전사자 없음</p>}
            </div>
            <div className="battle-report-subsection">
              <strong>부상자</strong>
              {report.wounded.length > 0 ? (
                <ul>{report.wounded.map(person => <li key={person.residentId}><b>{person.name}</b><span>{person.groupLabel} · 체력 {person.healthAfter}</span></li>)}</ul>
              ) : <p>부상자 없음</p>}
            </div>
            <p className="battle-report-survivors">생존 {report.defendersSurvived}명 / 동원 {report.defendersCommitted}명</p>
          </section>

          <section className="battle-report-section enemy">
            <h3>적 피해</h3>
            <div className="battle-report-force-line"><span>교전 전</span><strong>{report.raidersCommitted}명</strong></div>
            <div className="battle-report-force-line"><span>전투 중 처치</span><strong>{report.raidersKilled}명</strong></div>
            <div className="battle-report-force-line"><span>대열 이탈·도주</span><strong>{report.raidersEscaped}명</strong></div>
            <div className="battle-report-force-bar" aria-label={`적 병력 ${report.raidersCommitted}명 중 ${report.raidersKilled}명 처치`}>
              <i style={{ width: `${report.raidersCommitted > 0 ? report.raidersKilled / report.raidersCommitted * 100 : 0}%` }} />
            </div>
            <p>포로 판정은 아직 없으며, 생존한 습격자는 모두 도주 인원으로 기록됩니다.</p>
          </section>

          <section className="battle-report-section losses">
            <h3>마을 피해</h3>
            <div className="battle-report-subsection">
              <strong>파손 시설</strong>
              {report.damagedBuildings.length > 0 ? (
                <ul>{report.damagedBuildings.map((type, index) => <li key={`${type}-${index}`}><b>{BUILDING_DEFS[type].name}</b><span>수리 필요</span></li>)}</ul>
              ) : <p>파손 시설 없음</p>}
            </div>
            <div className="battle-report-subsection">
              <strong>약탈 자원</strong>
              {loot.length > 0 ? (
                <ul>{loot.map(([resource, amount]) => <li key={resource}><b>{RESOURCE_NAMES[resource as ResourceId]}</b><span>-{amount}</span></li>)}</ul>
              ) : <p>자원 피해 없음</p>}
            </div>
          </section>

          <section className="battle-report-section chronicle">
            <h3>주요 전황</h3>
            {report.highlights.length > 0 ? (
              <ol>{report.highlights.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}</ol>
            ) : <p>별도로 기록할 전황 없음</p>}
          </section>
        </div>

        <footer className="battle-report-footer">
          <div><span>명성</span><strong className={report.reputationDelta >= 0 ? 'positive' : 'negative'}>{signed(report.reputationDelta)}</strong></div>
          <div><span>세력 관계</span><strong className={report.relationDelta >= 0 ? 'positive' : 'negative'}>{signed(report.relationDelta)}</strong></div>
          <div><span>잔여 위협도</span><strong>{report.threatAfter}</strong></div>
          <button type="button" className="btn primary" onClick={onClose}>장계를 접고 마을로 돌아가기</button>
        </footer>
      </article>
    </div>
  );
}
