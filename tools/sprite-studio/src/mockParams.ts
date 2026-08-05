// 표시 비율 키 → drawResident에 넘길 모의 파라미터.
//
// 키 명명 규칙이 곧 모의 규칙이다. drawResident의 분기 순서(i2v → 지게 → 직업 switch)를
// 따라, 각 키가 실제로 그 경로에 닿도록 파라미터를 고른다.
import type { ResidentDrawParams } from '@game/render/sprites';
import type { Gender, JobId } from '@game/game/types';

export interface KeyPreview {
  params: Omit<ResidentDrawParams, 'x' | 'y' | 'gender'>;
  /** 더 높은 우선순위 경로에 가려 이 시트가 안 나올 수 있는 키 (시트 유무에 달림) */
  shadowedBy?: string;
  label: string;
}

const base = {
  sick: false,
  carrying: false,
  selected: false,
  showJobMarker: false,
  showCargoMarker: false,
} satisfies Partial<ResidentDrawParams>;

function job(id: string): JobId {
  return id as JobId;
}

export function previewForKey(key: string): KeyPreview {
  // i2v.<직업> — 분기 맨 앞이라 이동 중이면 바로 닿는다
  if (key.startsWith('i2v.')) {
    const id = key.slice(4);
    return { params: { ...base, job: job(id), moving: true }, label: `${id} 보행 (I2V)` };
  }

  // jige.<직업> — 짐을 지면 i2v가 스스로 물러난다
  if (key.startsWith('jige.')) {
    const id = key.slice(5);
    return { params: { ...base, job: job(id), carrying: true, moving: true }, label: `${id} 지게 운반` };
  }

  switch (key) {
    case 'common':
      // 공용 보행 시트는 전용 시트가 전부 빠졌을 때의 마지막 폴백이다.
      return {
        params: { ...base, job: job('idle'), moving: true },
        shadowedBy: 'video.idle.walk',
        label: '공용 보행 (폴백)',
      };
    case 'video.idle.walk':
      return { params: { ...base, job: job('idle'), moving: true }, label: '무직 보행 (영상)' };
    case 'video.woodcutter.work':
      return { params: { ...base, job: job('woodcutter'), working: true, moving: false }, label: '벌목 작업 (영상)' };
    case 'video.woodcutter.walk.axe':
      return { params: { ...base, job: job('woodcutter'), moving: true }, label: '벌목꾼 보행 · 도끼 (영상)' };
    case 'video.woodcutter.walk.jige':
      return {
        params: { ...base, job: job('woodcutter'), moving: true, carryingWood: true },
        label: '벌목꾼 보행 · 지게 (영상)',
      };
    case 'work.woodcutter':
      return {
        params: { ...base, job: job('woodcutter'), working: true, moving: false },
        shadowedBy: 'video.woodcutter.work',
        label: '벌목 작업 (폴백)',
      };
    case 'walk.woodcutter':
      return {
        params: { ...base, job: job('woodcutter'), moving: true },
        shadowedBy: 'video.woodcutter.walk.axe',
        label: '벌목꾼 보행 (폴백)',
      };
    case 'load.woodcutter':
      return {
        params: { ...base, job: job('woodcutter'), moving: true, carryingWood: true },
        shadowedBy: 'video.woodcutter.walk.jige',
        label: '벌목꾼 목재 운반 (폴백)',
      };
    case 'work.farmer.oxPlow':
      return { params: { ...base, job: job('farmer'), working: true, moving: false, farmerAction: 'oxPlow' }, label: '농부 쟁기질' };
    case 'work.farmer.harvest':
      return { params: { ...base, job: job('farmer'), working: true, moving: false, farmerAction: 'harvest' }, label: '농부 수확' };
    case 'work.farmer.till':
      return { params: { ...base, job: job('farmer'), working: true, moving: false, farmerAction: 'till' }, label: '농부 김매기' };
    case 'work.fisher.mudflatShellfish':
      return {
        params: { ...base, job: job('fisher'), working: true, moving: false, fisherAction: 'mudflatShellfish' },
        label: '어부 갯벌 조개·게 채취',
      };
    case 'load.hunter':
      return { params: { ...base, job: job('hunter'), moving: true, carryingGame: true }, label: '사냥꾼 사냥감 운반' };
    case 'load.miner':
      return { params: { ...base, job: job('miner'), moving: true, carryingMinerals: true }, label: '채광꾼 광물 운반' };
    case 'cart.hauler':
      return { params: { ...base, job: job('hauler'), moving: true, cartEquipped: true }, label: '운반꾼 수레' };
    case 'cart-load.hauler':
      return {
        params: { ...base, job: job('hauler'), moving: true, cartEquipped: true, carrying: true },
        label: '운반꾼 수레 · 적재',
      };
    case 'saltMaker.idle':
      return { params: { ...base, job: job('saltMaker'), moving: false, working: false }, label: '염부 대기' };
    case 'saltMaker.walk':
      return { params: { ...base, job: job('saltMaker'), moving: true, working: false }, label: '염부 해안 왕복' };
    case 'saltMaker.seaIntake':
      return {
        params: { ...base, job: job('saltMaker'), moving: false, working: true, saltMakerAction: 'seaIntake' },
        label: '염부 바닷물 취수',
      };
    case 'saltMaker.kilnWork':
      return {
        params: { ...base, job: job('saltMaker'), moving: false, working: true, saltMakerAction: 'kilnWork' },
        label: '염부 가마 작업',
      };
    default:
      break;
  }

  // work.<직업> — 제자리 작업
  if (key.startsWith('work.')) {
    const id = key.slice(5);
    return { params: { ...base, job: job(id), working: true, moving: false }, label: `${id} 작업` };
  }
  // walk.<직업> — 전용 보행 시트. i2v가 있는 직업이면 그쪽이 먼저 잡힌다.
  if (key.startsWith('walk.')) {
    const id = key.slice(5);
    return {
      params: { ...base, job: job(id), moving: true },
      shadowedBy: `i2v.${id}`,
      label: `${id} 보행`,
    };
  }
  return { params: { ...base, job: job('idle'), moving: true }, label: key };
}

export const PREVIEW_GENDERS: readonly Gender[] = ['male', 'female'];
