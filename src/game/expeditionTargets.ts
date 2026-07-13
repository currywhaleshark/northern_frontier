import { predatorExpeditionTarget } from './expedition';
import type { GameState, PredatorKind } from './types';

export interface ExpeditionTargetMarker {
  key: string;
  x: number;
  y: number;
  radius: number;
  label: string;
  kind: PredatorKind | 'lair';
  expeditionTarget: boolean;
}

function predatorName(kind: PredatorKind): string {
  return kind === 'wolf' ? '늑대 토벌 지역' : '호랑이 토벌 지역';
}

export function activeExpeditionTargetMarkers(state: GameState): ExpeditionTargetMarker[] {
  const markers: ExpeditionTargetMarker[] = [];
  for (const kind of ['wolf', 'tiger'] as const) {
    if (!state.incidents.predatorThreats[kind]) continue;
    const target = predatorExpeditionTarget(state, kind);
    if (!target) continue;
    const habitat = state.habitats.find(candidate => candidate.id === target.habitatId);
    const expeditionTarget = state.expedition?.kind === 'predatorHunt' &&
      state.expedition.predatorKind === kind && state.expedition.phase !== 'return';
    markers.push({
      key: `predator-${kind}`,
      x: target.x,
      y: target.y,
      radius: habitat?.radius ?? 3,
      label: `${predatorName(kind)}${expeditionTarget ? ' · 출정 목표' : ''}`,
      kind,
      expeditionTarget,
    });
  }

  const expedition = state.expedition;
  if (expedition?.kind === 'lairAssault' && expedition.phase !== 'return') {
    const site = expedition.targetSiteId == null
      ? null
      : state.foreignSites.find(candidate => candidate.id === expedition.targetSiteId);
    markers.push({
      key: `lair-${expedition.targetSiteId ?? `${expedition.targetX}-${expedition.targetY}`}`,
      x: expedition.targetX,
      y: expedition.targetY,
      radius: Math.max(2.5, ((site?.width ?? 1) + (site?.height ?? 1)) / 2),
      label: `${site?.name ?? '산채'} 토벌 목표`,
      kind: 'lair',
      expeditionTarget: true,
    });
  }
  return markers;
}
