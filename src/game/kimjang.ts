import { CONFIG } from './config';
import { isBuildingUnlocked } from './buildings';
import { addLog } from './events';
import { freeJangdokdaeOnggiCapacity } from './fermentation';
import { getDayOfSeason, getSeason, getYear } from './seasons';
import type { Building, GameState, PendingChoice } from './types';

type KimjangSize = keyof typeof CONFIG.fermentation.kimjangSizes;

interface KimjangRequirements {
  onggi: number;
  vegetables: number;
  salt: number;
  kimchi: number;
}

const SIZE_PRESENTATION: Record<KimjangSize, { label: string; desc: string }> = {
  small: { label: '작게 담근다', desc: '한 집안이 거들 만큼만 담가 겨울 채소 반찬을 조금 마련합니다.' },
  medium: { label: '마을 김장을 한다', desc: '이웃이 함께 품을 나누어 겨울 채소 반찬을 넉넉히 마련합니다.' },
  large: { label: '크게 김장한다', desc: '여러 장독대를 가득 써서 긴 겨울을 버틸 공동 비축을 만듭니다.' },
};

function builtJangdokdaes(state: GameState): Building[] {
  return state.buildings
    .filter(building => building.built && building.type === 'jangdokdae')
    .sort((a, b) => a.id - b.id);
}

export function isKimjangWindow(day: number): boolean {
  const season = getSeason(day);
  const dayOfSeason = getDayOfSeason(day);
  return (season === 'autumn' && dayOfSeason >= CONFIG.fermentation.kimjangAutumnStartDay)
    || (season === 'winter' && dayOfSeason <= CONFIG.fermentation.kimjangWinterEndDay);
}

function kimjangRequirements(size: KimjangSize): KimjangRequirements {
  const onggi = CONFIG.fermentation.kimjangSizes[size];
  return {
    onggi,
    vegetables: onggi * CONFIG.fermentation.kimchiVegetablesPerOnggi,
    salt: onggi * CONFIG.fermentation.kimchiSaltPerOnggi,
    kimchi: onggi * CONFIG.fermentation.kimchiOutputPerOnggi,
  };
}

function kimjangFreeOnggiCapacity(state: GameState): number {
  return builtJangdokdaes(state).reduce(
    (total, building) => total + Math.floor(freeJangdokdaeOnggiCapacity(building) + 1e-9),
    0,
  );
}

function shortageReason(state: GameState, requirements: KimjangRequirements): string | undefined {
  const shortages: string[] = [];
  if (state.resources.vegetables < requirements.vegetables) {
    shortages.push(`채소 ${Math.floor(state.resources.vegetables)}/${requirements.vegetables}`);
  }
  if (state.resources.salt < requirements.salt) {
    shortages.push(`소금 ${Math.floor(state.resources.salt)}/${requirements.salt}`);
  }
  if (state.resources.onggi < requirements.onggi) {
    shortages.push(`옹기 ${Math.floor(state.resources.onggi)}/${requirements.onggi}`);
  }
  const freeCapacity = kimjangFreeOnggiCapacity(state);
  if (freeCapacity < requirements.onggi) {
    shortages.push(`장독대 빈자리 ${freeCapacity}/${requirements.onggi}`);
  }
  return shortages.length > 0 ? `${shortages.join(' · ')} 부족` : undefined;
}

export function maybeOpenKimjangEvent(state: GameState): boolean {
  const year = getYear(state.day);
  if (!isBuildingUnlocked(state.rank, 'jangdokdae') || state.pendingChoice ||
      !isKimjangWindow(state.day) || state.lastKimjangYear >= year) return false;

  const freeCapacity = kimjangFreeOnggiCapacity(state);
  state.lastKimjangYear = year;
  state.pendingChoice = {
    kind: 'incident',
    title: '입동을 앞둔 김장',
    body: `찬바람이 불기 시작하자 이웃들이 한데 모여 겨울 김치를 담그자고 합니다. ` +
      `현재 채소 ${Math.floor(state.resources.vegetables)}, 소금 ${Math.floor(state.resources.salt)}, ` +
      `옹기 ${Math.floor(state.resources.onggi)}, 장독대 빈자리 ${freeCapacity}.`,
    options: (Object.keys(CONFIG.fermentation.kimjangSizes) as KimjangSize[]).map(size => {
      const requirements = kimjangRequirements(size);
      const reason = shortageReason(state, requirements);
      const presentation = SIZE_PRESENTATION[size];
      return {
        id: `kimjang-${size}`,
        label: presentation.label,
        desc: `${presentation.desc} 채소 ${requirements.vegetables}·소금 ${requirements.salt}·옹기 ${requirements.onggi} → 김치 ${requirements.kimchi}.`,
        disabled: reason != null,
        disabledReason: reason,
      };
    }).concat([{
      id: 'kimjang-skip',
      label: '올해는 건너뛴다',
      desc: '재료와 장독대는 아끼지만 겨울 채소 반찬과 공동 작업의 민심 보너스를 얻지 못합니다.',
      disabled: false,
      disabledReason: undefined,
    }]),
    data: { eventId: 'kimjang', year },
  };
  return true;
}

export function isKimjangChoice(choice: PendingChoice): boolean {
  return choice.kind === 'incident' && choice.data.eventId === 'kimjang';
}

export function resolveKimjangChoice(state: GameState, optionId: string): void {
  const choice = state.pendingChoice;
  if (!choice || !isKimjangChoice(choice)) return;
  state.pendingChoice = null;

  if (optionId === 'kimjang-skip') {
    addLog(state, '올해는 공동 김장을 건너뛰고 남은 채소와 소금을 아껴 두기로 했습니다.', 'info', true);
    return;
  }
  const size = optionId.startsWith('kimjang-') ? optionId.slice('kimjang-'.length) as KimjangSize : null;
  if (!size || !(size in CONFIG.fermentation.kimjangSizes)) return;
  const requirements = kimjangRequirements(size);
  const reason = shortageReason(state, requirements);
  if (reason) {
    addLog(state, `김장을 시작하지 못했습니다. ${reason}.`, 'bad', true);
    return;
  }

  state.resources.vegetables -= requirements.vegetables;
  state.resources.salt -= requirements.salt;
  state.resources.onggi -= requirements.onggi;
  let remainingOnggi = requirements.onggi;
  for (const yard of builtJangdokdaes(state)) {
    const available = Math.floor(freeJangdokdaeOnggiCapacity(yard) + 1e-9);
    const used = Math.min(remainingOnggi, available);
    if (used <= 0) continue;
    yard.fermentBatches ??= [];
    yard.fermentBatches.push({
      kind: 'kimchi',
      amount: used * CONFIG.fermentation.kimchiOutputPerOnggi,
      readyOnDay: state.day + CONFIG.fermentation.kimchiMaturationDays,
    });
    remainingOnggi -= used;
    if (remainingOnggi <= 0) break;
  }
  addLog(
    state,
    `이웃들이 함께 김치 ${requirements.kimchi}분을 담갔습니다. ${CONFIG.fermentation.kimchiMaturationDays}일 뒤 익습니다.`,
    'good',
    true,
  );
}
