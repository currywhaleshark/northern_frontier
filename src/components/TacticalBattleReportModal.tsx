import { BUILDING_DEFS } from '../game/buildings';
import { RESOURCE_NAMES } from '../game/constants';
import { TACTICAL_BATTLE_GRADE_LABELS } from '../game/tacticalCore';
import type { ResourceId, TacticalBattleReport } from '../game/types';

interface Props {
  report: TacticalBattleReport;
  onClose: () => void;
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${value}`;
}

function roundedResourceAmount(value: number | undefined): number {
  return Math.round(value ?? 0);
}

function outcomeTone(result: TacticalBattleReport['result']): string {
  return result === 'victory' ? 'victory' : 'defeat';
}

export function TacticalBattleReportModal({ report, onClose }: Props) {
  const resourceDelta = Object.entries(report.resourceDelta)
    .map(([resource, amount]) => [resource, roundedResourceAmount(amount)] as const)
    .filter(([, amount]) => amount !== 0);
  const recoveredLoot = Object.entries(report.recoveredLoot ?? {})
    .map(([resource, amount]) => [resource, roundedResourceAmount(amount)] as const)
    .filter(([, amount]) => amount > 0);
  const enemySurvivorLabel = report.encounterKind === 'predatorHunt'
    ? '남은 맹수'
    : report.enemyRouted ? '도주한 적' : '물러난 적';
  const enemyUnit = report.encounterKind === 'predatorHunt' ? '마리' : '명';
  const contextLine = report.encounterKind === 'raidDefense'
    ? `${report.mode === 'levy' ? '민병 방어' : '수비병 요격'} · ${report.warned ? '사전 경보' : '기습 대응'}`
    : report.encounterKind === 'banditLair'
      ? `산채 상태 ${report.siteOutcome === 'burned'
        ? '소각'
        : report.siteOutcome === 'abandoned'
          ? '폐기'
          : report.siteOutcome === 'unchanged' ? '유지 · 철수' : '요새화'}`
      : `결과 ${report.predatorOutcome === 'killed'
        ? '사살'
        : report.predatorOutcome === 'repelled'
          ? '격퇴'
          : report.predatorOutcome === 'huntersDefeated'
            ? '사냥대 패퇴'
            : report.predatorOutcome === 'withdrawn' ? '사냥 중지 · 철수' : '맹수 도주'}`;
  return (
    <div className="battle-report-overlay" role="dialog" aria-modal="true" aria-label="상세 전투 장계">
      <article className="battle-report-modal">
        <header className="battle-report-header">
          <div>
            <span>{report.title}</span>
            <h2>{report.enemyLabel}</h2>
            <p>{report.date} · {contextLine}</p>
          </div>
          <button type="button" className="battle-report-close" onClick={onClose} title="장계 닫기" aria-label="장계 닫기">×</button>
        </header>

        <div className={`battle-report-outcome ${outcomeTone(report.result)}`}>
          <div className="battle-report-outcome-copy">
            <b
              className={`battle-report-result ${report.result}`}
              title="초기 전력차, 양측 피해, 약탈·노획 물자를 종합한 평가"
            >
              {TACTICAL_BATTLE_GRADE_LABELS[report.grade]}
            </b>
            <strong>{report.outcomeLabel}</strong>
            <p>{report.closingSummary}</p>
          </div>
          <span>
            초기 전력 아군 {Math.round(report.initialFriendlyPower)} · 적 {Math.round(report.initialEnemyPower)}<br />
            {report.rounds}회 교전 · 최종 기세 아군 {report.villageMorale}, 적 {report.raiderMorale}
          </span>
        </div>

        <div className="battle-report-totals">
          <div><span>{report.friendlyLabel} 동원</span><strong>{report.defendersCommitted}명</strong></div>
          <div><span>아군 전사</span><strong>{report.killed.length}명</strong></div>
          <div><span>아군 부상</span><strong>{report.wounded.length}명</strong></div>
          <div><span>{report.enemyLabel}</span><strong>{report.raidersCommitted}{enemyUnit}</strong></div>
          <div><span>적 처치</span><strong>{report.raidersKilled}{enemyUnit}</strong></div>
          <div><span>{enemySurvivorLabel}</span><strong>{report.raidersEscaped}{enemyUnit}</strong></div>
        </div>

        <div className="battle-report-body">
          <section className="battle-report-section friendly">
            <h3>{report.friendlyLabel} 피해</h3>
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
            <h3>{report.enemyLabel} 피해</h3>
            <div className="battle-report-force-line"><span>교전 전</span><strong>{report.raidersCommitted}{enemyUnit}</strong></div>
            <div className="battle-report-force-line"><span>전투 중 처치</span><strong>{report.raidersKilled}{enemyUnit}</strong></div>
            <div className="battle-report-force-line"><span>{enemySurvivorLabel}</span><strong>{report.raidersEscaped}{enemyUnit}</strong></div>
            <div className="battle-report-force-bar" aria-label={`적 병력 ${report.raidersCommitted}명 중 ${report.raidersKilled}명 처치`}>
              <i style={{ width: `${report.raidersCommitted > 0 ? report.raidersKilled / report.raidersCommitted * 100 : 0}%` }} />
            </div>
            <p>{report.closingSummary} 생존한 적은 물러난 인원으로 기록됩니다.</p>
          </section>

          <section className="battle-report-section losses">
            <h3>{report.encounterKind === 'raidDefense' ? '마을 피해' : '전리품·소모 자원'}</h3>
            {report.encounterKind === 'raidDefense' && (
            <div className="battle-report-subsection">
              <strong>파손 시설</strong>
              {report.damagedBuildings.length > 0 ? (
                <ul>{report.damagedBuildings.map((type, index) => <li key={`${type}-${index}`}><b>{BUILDING_DEFS[type].name}</b><span>수리 필요</span></li>)}</ul>
              ) : <p>파손 시설 없음</p>}
            </div>)}
            <div className="battle-report-subsection">
              <strong>자원 변동</strong>
              {resourceDelta.length > 0 ? (
                <ul>{resourceDelta.map(([resource, amount]) => <li key={resource}><b>{RESOURCE_NAMES[resource as ResourceId]}</b><span>{signed(amount)}</span></li>)}</ul>
              ) : <p>자원 변동 없음</p>}
            </div>
            {recoveredLoot.length > 0 && (
              <div className="battle-report-subsection">
                <strong>궤주 후 회수</strong>
                <ul>{recoveredLoot.map(([resource, amount]) => (
                  <li key={resource}><b>{RESOURCE_NAMES[resource as ResourceId]}</b><span>+{amount}</span></li>
                ))}</ul>
              </div>
            )}
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
          <button type="button" className="btn primary" onClick={onClose}>{report.encounterKind === 'raidDefense' ? '장계를 접고 마을로 돌아가기' : '장계를 접고 귀환 화면으로'}</button>
        </footer>
      </article>
    </div>
  );
}
