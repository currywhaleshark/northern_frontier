// 연대기 화면 — 마을이 걸어온 길의 회고.
//
// 3부 구성: 표제(진입 맥락에 따라 다름) · 연대기(연도별 사건) · 통계(현재/누적/추이).
// 기록을 읽기만 한다 — 사건 재구성이나 재계산은 게임 계층(annals·chronicleStats) 소관.
// 계획: docs/DESIGN-2026-07-29-chronicle-screen.md
import { useMemo } from 'react';
import { CONFIG } from '../game/config';
import { JOB_NAMES, RANK_NAMES, RESOURCE_NAMES, SEASON_NAMES } from '../game/constants';
import {
  combatReadyResidentCount, cultivatedArea, fortificationStats, generalBuildingCounts,
} from '../game/chronicleStats';
import { foodTotal, fuelHeatTotal } from '../game/consumption';
import { LIVESTOCK_DEFS, normalizeLivestockState } from '../game/livestock';
import { getDayOfSeason, getSeason, getYear } from '../game/seasons';
import { settlementDisplayName } from '../game/settlementName';
import type { AnnalsEntry, AnnalsKind, GameState, JobId, LivestockId } from '../game/types';

interface Props {
  state: GameState;
  onClose: () => void;
}

const KIND_META: Record<AnnalsKind, { label: string; tone: string }> = {
  legacy: { label: '옛 기록', tone: 'legacy' },
  founding: { label: '창건', tone: 'gold' },
  promotion: { label: '승격', tone: 'gold' },
  winter: { label: '혹한', tone: 'ice' },
  disaster: { label: '재해', tone: 'danger' },
  raid: { label: '습격', tone: 'danger' },
  battle: { label: '전투', tone: 'danger' },
  special: { label: '인물', tone: 'violet' },
  grant: { label: '하사', tone: 'gold' },
  population: { label: '인구', tone: 'green' },
  building: { label: '건물', tone: 'earth' },
  trade: { label: '교역', tone: 'teal' },
  court: { label: '조정', tone: 'blue' },
  ending: { label: '기록', tone: 'gold' },
};

function dayLabel(day: number): string {
  return `${SEASON_NAMES[getSeason(day)]} ${getDayOfSeason(day)}일`;
}

function groupByYear(annals: readonly AnnalsEntry[]): Array<{ year: number; entries: AnnalsEntry[] }> {
  const byYear = new Map<number, AnnalsEntry[]>();
  for (const entry of annals) {
    const year = getYear(entry.day);
    const bucket = byYear.get(year) ?? [];
    bucket.push(entry);
    byYear.set(year, bucket);
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, entries]) => ({ year, entries: entries.sort((a, b) => a.day - b.day) }));
}

// ── 추이 그래프 (SVG) — 계열별 자기 최대값 기준 상대 곡선 ──

interface TrendSeries {
  label: string;
  color: string;
  values: number[];
}

function TrendChart({ years, series }: { years: number[]; series: TrendSeries[] }) {
  const width = 560;
  const height = 170;
  const pad = { left: 14, right: 14, top: 12, bottom: 24 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const xFor = (index: number) =>
    pad.left + (years.length <= 1 ? innerW / 2 : (index / (years.length - 1)) * innerW);
  const pathFor = (values: number[]): string => {
    const max = Math.max(1, ...values);
    return values
      .map((value, index) =>
        `${index === 0 ? 'M' : 'L'}${xFor(index).toFixed(1)},${(pad.top + innerH - (value / max) * innerH).toFixed(1)}`)
      .join(' ');
  };
  // 눈금은 연도 6개까지만 — 장기 플레이에서 라벨이 겹치지 않게 솎는다
  const tickStep = Math.max(1, Math.ceil(years.length / 6));
  return (
    <svg
      className="chronicle-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="연도별 추이 그래프"
    >
      {[0.25, 0.5, 0.75].map(fraction => (
        <line
          key={fraction}
          x1={pad.left} x2={width - pad.right}
          y1={pad.top + innerH * fraction} y2={pad.top + innerH * fraction}
          className="chronicle-chart-grid"
        />
      ))}
      <line
        x1={pad.left} x2={width - pad.right} y1={pad.top + innerH} y2={pad.top + innerH}
        className="chronicle-chart-axis"
      />
      {years.map((year, index) => (
        index % tickStep === 0 && (
          <text key={year} x={xFor(index)} y={height - 8} className="chronicle-chart-tick" textAnchor="middle">
            {year}년
          </text>
        )
      ))}
      {series.map(entry => (
        <path key={entry.label} d={pathFor(entry.values)} fill="none" stroke={entry.color} strokeWidth={2} />
      ))}
      {series.map(entry => {
        const max = Math.max(1, ...entry.values);
        const last = entry.values[entry.values.length - 1] ?? 0;
        const cy = pad.top + innerH - (last / max) * innerH;
        return <circle key={entry.label} cx={xFor(entry.values.length - 1)} cy={cy} r={3} fill={entry.color} />;
      })}
    </svg>
  );
}

function StatCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="chronicle-stat-card">
      <div className="chronicle-stat-title">{title}</div>
      {rows.map(([label, value]) => (
        <div key={label} className="chronicle-stat-row">
          <span className="chronicle-stat-label">{label}</span>
          <span className="chronicle-stat-value">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function ChronicleScreen({ state, onClose }: Props) {
  const year = getYear(state.day);
  const yearGroups = useMemo(() => groupByYear(state.annals), [state.annals]);

  const stats = useMemo(() => {
    const living = state.residents.filter(resident => resident.alive);
    const stageCount = (stage: string | null | undefined) =>
      living.filter(resident => (resident.stage ?? null) === stage).length;
    const jobTally = new Map<JobId, number>();
    for (const resident of living) {
      if (resident.stage) continue;
      jobTally.set(resident.job, (jobTally.get(resident.job) ?? 0) + 1);
    }
    const topJobs = [...jobTally.entries()]
      .filter(([job]) => job !== 'idle')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([job, count]) => `${JOB_NAMES[job]} ${count}`)
      .join(' · ');
    const area = cultivatedArea(state);
    const forts = fortificationStats(state);
    const buildingCount = Object.values(generalBuildingCounts(state)).reduce<number>(
      (sum, count) => sum + (count ?? 0), 0);
    const livestock = new Map<LivestockId, number>();
    for (const building of state.buildings) {
      if (building.type !== 'stable' || !building.built) continue;
      const herd = normalizeLivestockState(building.livestock);
      if (herd.headcount > 0) livestock.set(herd.species, (livestock.get(herd.species) ?? 0) + herd.headcount);
    }
    const livestockLine = [...livestock.entries()]
      .map(([species, count]) => `${LIVESTOCK_DEFS[species].name} ${count}`)
      .join(' · ');
    const wallSegments = forts.palisadeSegments + forts.earthFortSegments + forts.stoneWallSegments;
    return { living, stageCount, topJobs, area, forts, buildingCount, livestockLine, wallSegments };
  }, [state]);

  const lifetime = state.lifetimeStats;
  const totalTrackedDeaths = Object.values(lifetime.deathsByCause).reduce((sum, count) => sum + count, 0);
  const snapshots = state.yearlySnapshots;
  const trackedSince = lifetime.trackingSinceDay > 1
    ? `정착 ${getYear(lifetime.trackingSinceDay)}년차 ${dayLabel(lifetime.trackingSinceDay)}부터 기록`
    : null;

  return (
    <div className="modal-overlay chronicle-overlay" onClick={onClose}>
      <div className="chronicle-scroll" onClick={event => event.stopPropagation()}>
        <button type="button" className="chronicle-close" onClick={onClose} aria-label="연대기 닫기">✕</button>

        {/* ── 표제부 ── */}
        <header className="chronicle-head">
          <div className="chronicle-head-rule" />
          <h1 className="chronicle-title">{settlementDisplayName(state)} 연대기</h1>
          <div className="chronicle-subtitle">
            {state.gameOver
              ? state.gameOver.won
                ? `개척 성공 — ${year}년의 기록`
                : `개척 실패 — ${year}년의 기록`
              : `${RANK_NAMES[state.rank]} · 정착 ${year}년차 ${dayLabel(state.day)}`}
          </div>
          {state.gameOver && <p className="chronicle-epigraph">{state.gameOver.reason}</p>}
          <div className="chronicle-head-rule" />
        </header>

        {/* ── 연대기부 ── */}
        <section className="chronicle-annals">
          {yearGroups.length === 0 && (
            <div className="muted small">아직 기록된 사건이 없습니다.</div>
          )}
          {yearGroups.map(group => (
            <div key={group.year} className="chronicle-year">
              <div className="chronicle-year-head">
                <span className="chronicle-year-label">정착 {group.year}년차</span>
                <span className="chronicle-year-line" />
              </div>
              <ul className="chronicle-entries">
                {group.entries.map((entry, index) => (
                  <li key={`${entry.day}:${index}`} className="chronicle-entry">
                    <span className={`chronicle-chip tone-${KIND_META[entry.kind].tone}`}>
                      {KIND_META[entry.kind].label}
                    </span>
                    <span className="chronicle-entry-day">{dayLabel(entry.day)}</span>
                    <span className="chronicle-entry-text">{entry.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {/* ── 통계부 ── */}
        <section className="chronicle-stats">
          <div className="chronicle-section-head">
            <span className="chronicle-year-label">통계</span>
            <span className="chronicle-year-line" />
          </div>
          {trackedSince && <div className="muted small chronicle-tracking-note">{trackedSince}</div>}

          <div className="chronicle-stat-grid">
            <StatCard
              title="마을"
              rows={[
                ['등급', RANK_NAMES[state.rank]],
                ['정착 연차', `${year}년차`],
                ['일반 건물', `${stats.buildingCount}동`],
                ['개간 면적', `밭 ${stats.area.fieldTiles} · 논 ${stats.area.paddyTiles} (총 ${stats.area.totalTiles}칸)`],
              ]}
            />
            <StatCard
              title="인구"
              rows={[
                ['총원', `${stats.living.length}명`],
                ['구성', `성인 ${stats.stageCount(null)} · 소년 ${stats.stageCount('youth')} · 아이 ${stats.stageCount('child')} · 영아 ${stats.stageCount('infant')}`],
                ['주요 생업', stats.topJobs || '—'],
              ]}
            />
            <StatCard
              title="군사"
              rows={[
                ['전투 가능', `${combatReadyResidentCount(state)}명`],
                ['무기', `창 ${Math.floor(state.resources.spears ?? 0)} · 각궁 ${Math.floor(state.resources.hornBows ?? 0)} · 조총 ${Math.floor(state.resources.muskets ?? 0)}`],
                ['성벽', `${stats.wallSegments}구간 (성문 ${stats.forts.gates})`],
                ['망루·봉수', `${stats.forts.watchtowers} · ${stats.forts.beacons}`],
              ]}
            />
            <StatCard
              title="경제"
              rows={[
                ['식량', `${Math.round(foodTotal(state))}`],
                ['땔감(열량)', `${Math.round(fuelHeatTotal(state))}`],
                [RESOURCE_NAMES.silver, `${Math.floor(state.resources.silver ?? 0)}`],
                ['가축', stats.livestockLine || '—'],
              ]}
            />
            <StatCard
              title="평생 기록"
              rows={[
                ['출생', `${lifetime.births}명`],
                ['사망', `${totalTrackedDeaths}명 (전투 ${lifetime.deathsByCause.combat} · 아사 ${lifetime.deathsByCause.starvation} · 동사 ${lifetime.deathsByCause.cold} · 병사 ${lifetime.deathsByCause.disease} · 기타 ${lifetime.deathsByCause.other})`],
                ['습격', `격퇴 ${lifetime.raidsRepelled} · 피해 ${lifetime.raidsSuffered}`],
                ['거래·하사', `거래 ${lifetime.tradesCompleted}회 · 하사 ${lifetime.grantsReceived}회`],
              ]}
            />
          </div>

          {snapshots.length >= 2 && (
            <div className="chronicle-trend">
              <div className="chronicle-stat-title">연도별 추이 <span className="muted small">(계열별 상대 곡선)</span></div>
              <TrendChart
                years={snapshots.map(snapshot => snapshot.year)}
                series={[
                  { label: '인구', color: '#7fb069', values: snapshots.map(snapshot => snapshot.population) },
                  { label: '식량', color: '#d9a441', values: snapshots.map(snapshot => snapshot.food) },
                  { label: '전투 가능', color: '#c0564b', values: snapshots.map(snapshot => snapshot.combatReadyResidents) },
                ]}
              />
              <div className="chronicle-legend">
                <span><i style={{ background: '#7fb069' }} /> 인구 {snapshots[snapshots.length - 1].population}</span>
                <span><i style={{ background: '#d9a441' }} /> 식량 {snapshots[snapshots.length - 1].food}</span>
                <span><i style={{ background: '#c0564b' }} /> 전투 가능 {snapshots[snapshots.length - 1].combatReadyResidents}</span>
              </div>
            </div>
          )}
        </section>

        <footer className="chronicle-foot">
          <div className="chronicle-head-rule" />
          <div className="muted small">{CONFIG.time.yearDays}일이 한 해 — 두만강 이북, {settlementDisplayName(state)}에서.</div>
        </footer>
      </div>
    </div>
  );
}
