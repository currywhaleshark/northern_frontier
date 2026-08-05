import type { GameState } from '../game/types';

export type FeedbackKind = 'bug' | 'suggestion';

export interface FeedbackDraft {
  kind: FeedbackKind;
  title: string;
  description: string;
  reproduction: string;
  includeDiagnostics: boolean;
}

interface FeedbackContext {
  speed: number;
  zoom: number;
  userAgent?: string;
}

export function buildFeedbackDiagnostics(state: GameState, context: FeedbackContext, logLimit = 120) {
  return {
    capturedAt: new Date().toISOString(),
    schemaVersion: state.schemaVersion,
    game: {
      day: state.day,
      subTick: state.subTick,
      difficulty: state.difficulty,
      seed: state.seed,
      rank: state.rank,
      population: state.residents.filter(resident => resident.alive).length,
      buildings: state.buildings.length,
      speed: context.speed,
      zoom: context.zoom,
      pendingChoice: state.pendingChoice?.kind ?? null,
      tacticalBattle: Boolean(state.tacticalBattle),
      gameOver: state.gameOver?.reason ?? null,
    },
    browser: context.userAgent ?? '',
    logs: state.log.slice(-logLimit).map(entry => ({
      day: entry.day,
      kind: entry.kind,
      important: entry.important === true,
      text: entry.text.slice(0, 300),
    })),
  };
}

function buildFeedbackMarkdown(
  draft: FeedbackDraft,
  state: GameState,
  context: FeedbackContext,
): string {
  const parts = [
    `## ${draft.kind === 'bug' ? '버그 설명' : '의견·제안'}`,
    draft.description.trim() || '(내용 없음)',
  ];
  if (draft.kind === 'bug') {
    parts.push('## 재현 방법', draft.reproduction.trim() || '(재현 방법 미입력)');
  }
  if (draft.kind === 'bug' && draft.includeDiagnostics) {
    const diagnostics = buildFeedbackDiagnostics(state, context, 35);
    parts.push(
      '## 게임 진단 기록',
      '<details><summary>기록 펼치기</summary>',
      '',
      '```json',
      JSON.stringify(diagnostics, null, 2),
      '```',
      '</details>',
    );
  }
  return parts.join('\n\n');
}

export function buildFeedbackIssueUrl(
  draft: FeedbackDraft,
  state: GameState,
  context: FeedbackContext,
): string {
  const url = new URL('https://github.com/currywhaleshark/northern_frontier/issues/new');
  url.searchParams.set('title', `[${draft.kind === 'bug' ? '버그' : '의견'}] ${draft.title.trim() || '제목 없음'}`);
  url.searchParams.set('body', buildFeedbackMarkdown(draft, state, context));
  return url.toString();
}
