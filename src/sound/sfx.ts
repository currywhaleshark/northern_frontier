// 절차 합성 사운드 — 외부 오디오 파일 없이 Web Audio API로 모든 소리를 만든다.
// 브라우저 자동재생 정책 때문에 첫 사용자 입력 후 initAudio()를 불러야 소리가 난다.
import type { WeatherId } from '../game/types';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = typeof localStorage !== 'undefined' && localStorage.getItem('buksae-muted') === '1';

// 바람 앰비언트 루프 상태
let windGain: GainNode | null = null;
let windTarget = 0;

const MASTER_VOL = 0.22;
const lastPlay: Record<string, number> = {};

export function initAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOL;
    master.connect(ctx.destination);
    // 화이트노이즈 버퍼 (돌풍/북/망치의 재료)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    startWindLoop();
  } catch {
    ctx = null;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try { localStorage.setItem('buksae-muted', m ? '1' : '0'); } catch { /* ignore */ }
  if (ctx && master) {
    master.gain.linearRampToValueAtTime(m ? 0 : MASTER_VOL, ctx.currentTime + 0.1);
  }
}

// ── 합성 도우미 ──

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  delay?: number;
  slide?: number;   // 재생 동안 주파수 변화량
  attack?: number;
  humanize?: number; // 음정 흔들림(cents), 반복 재생 단조로움 완화
}

function tone(freq: number, dur: number, o: ToneOpts = {}): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + (o.delay ?? 0);
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  // 매 재생마다 미세하게 음정을 흔들어 같은 소리가 반복돼도 지루하지 않게
  const cents = o.humanize ?? 8;
  if (cents) osc.detune.setValueAtTime((Math.random() * 2 - 1) * cents, t0);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + o.slide), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(o.vol ?? 0.5, t0 + (o.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

interface NoiseOpts {
  filter?: number; // 밴드패스 중심 주파수
  q?: number;
  vol?: number;
  delay?: number;
  attack?: number;
}

function noiseBurst(dur: number, o: NoiseOpts = {}): void {
  if (!ctx || !master || !noiseBuf) return;
  const t0 = ctx.currentTime + (o.delay ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = o.filter ?? 800;
  f.Q.value = o.q ?? 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(o.vol ?? 0.3, t0 + (o.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.1);
}

// ── 효과음 ──

export type SfxName =
  | 'good' | 'hunt' | 'heal' | 'welcome' | 'warn'
  | 'bad' | 'death' | 'raidDrum' | 'raidHorn'
  | 'tradeBell' | 'gust' | 'hammer' | 'win' | 'lose'
  | 'volley' | 'melee' | 'ambush' | 'casualty' | 'moraleBreak' | 'lootCrash' | 'wallHit';

export function playSfx(name: SfxName): void {
  if (!ctx || !master || muted) return;
  const t = performance.now();
  if (lastPlay[name] != null && t - lastPlay[name] < 300) return; // 빠른 배속 스팸 방지
  lastPlay[name] = t;

  switch (name) {
    case 'good': // 건물 완공 — 목탁 같은 두 음(맑은 성취음)
      tone(660, 0.12, { vol: 0.25 });
      tone(988, 0.22, { vol: 0.2, delay: 0.09 });
      break;
    case 'hunt': // 사냥 성공 — 짧고 가벼운 나무 딱 소리 (자주 나므로 은은하게)
      tone(1040, 0.05, { type: 'triangle', vol: 0.12, humanize: 40 });
      tone(780, 0.07, { type: 'triangle', vol: 0.08, delay: 0.04, humanize: 40 });
      break;
    case 'heal': // 회복 — 부드럽게 오르는 두 음
      tone(523, 0.14, { vol: 0.14, humanize: 20 });
      tone(784, 0.22, { vol: 0.12, delay: 0.11, humanize: 20 });
      break;
    case 'welcome': // 이주민 도착 — 따뜻한 세 음 아르페지오
      tone(392, 0.16, { type: 'triangle', vol: 0.16 });
      tone(523, 0.16, { type: 'triangle', vol: 0.15, delay: 0.12 });
      tone(659, 0.26, { type: 'triangle', vol: 0.14, delay: 0.24 });
      break;
    case 'warn': // 식량/장작 부족 경고 — 두 번 두드리는 낮은 경고음
      tone(330, 0.14, { type: 'square', vol: 0.14, slide: -30 });
      tone(330, 0.16, { type: 'square', vol: 0.14, delay: 0.18, slide: -40 });
      break;
    case 'bad': // 질병/피해 — 낮게 처지는 음
      tone(240, 0.3, { vol: 0.25, slide: -70 });
      break;
    case 'death': // 조종(弔鐘)풍 저음
      tone(196, 0.6, { vol: 0.3, slide: -40 });
      tone(131, 0.8, { vol: 0.22, delay: 0.15, slide: -20 });
      break;
    case 'raidDrum': // 북소리
      noiseBurst(0.12, { filter: 220, q: 0.7, vol: 0.5 });
      tone(82, 0.28, { vol: 0.55, slide: -28 });
      break;
    case 'raidHorn': // 뿔나팔 + 북 — 습격 경보
      tone(147, 1.0, { type: 'sawtooth', vol: 0.22, attack: 0.22 });
      tone(220, 0.85, { type: 'sawtooth', vol: 0.12, attack: 0.28, delay: 0.05 });
      noiseBurst(0.12, { filter: 220, vol: 0.45, delay: 0.5 });
      tone(82, 0.3, { vol: 0.5, slide: -28, delay: 0.5 });
      break;
    case 'tradeBell': // 방울/엽전 짤랑
      tone(1319, 0.12, { type: 'triangle', vol: 0.16 });
      tone(1760, 0.15, { type: 'triangle', vol: 0.13, delay: 0.1 });
      tone(2093, 0.2, { type: 'triangle', vol: 0.1, delay: 0.19 });
      break;
    case 'gust': // 돌풍
      noiseBurst(1.8, { filter: 480, q: 0.5, vol: 0.22, attack: 0.5 });
      break;
    case 'hammer': // 건설 착수 망치질
      noiseBurst(0.05, { filter: 2200, q: 1.2, vol: 0.28 });
      tone(170, 0.08, { type: 'square', vol: 0.12 });
      noiseBurst(0.05, { filter: 2000, q: 1.2, vol: 0.22, delay: 0.14 });
      break;
    case 'win': { // 승격 — 오르는 다섯 음
      const notes = [523, 587, 659, 784, 1046];
      notes.forEach((f, i) => tone(f, 0.3, { vol: 0.22, delay: i * 0.16 }));
      break;
    }
    case 'lose': { // 몰락 — 내려가는 세 음
      const notes = [330, 262, 196];
      notes.forEach((f, i) => tone(f, 0.55, { type: 'sawtooth', vol: 0.14, delay: i * 0.3, slide: -12 }));
      break;
    }
    case 'volley': // 일제 사격 — 총성 크랙 연발 + 낮은 포연 울림
      [0, 0.06, 0.14, 0.23].forEach(d => noiseBurst(0.06, { filter: 2100 + Math.random() * 600, q: 1.1, vol: 0.24, delay: d }));
      tone(92, 0.24, { vol: 0.28, slide: -26, delay: 0.02 });
      noiseBurst(0.3, { filter: 500, q: 0.7, vol: 0.1, delay: 0.2, attack: 0.08 });
      break;
    case 'melee': // 백병전 — 금속 부딪힘 두어 번 + 함성 스웰
      noiseBurst(0.05, { filter: 3400, q: 2.2, vol: 0.26 });
      noiseBurst(0.05, { filter: 2800, q: 2.2, vol: 0.2, delay: 0.13 });
      tone(1240, 0.06, { type: 'triangle', vol: 0.1, delay: 0.13, humanize: 30 });
      noiseBurst(0.55, { filter: 320, q: 0.6, vol: 0.16, attack: 0.16 });
      break;
    case 'ambush': // 매복 — 수풀 휘익 + 기습 함성 북
      noiseBurst(0.22, { filter: 750, q: 1.4, vol: 0.24, attack: 0.02 });
      tone(110, 0.2, { vol: 0.32, slide: -30, delay: 0.14 });
      noiseBurst(0.06, { filter: 1900, q: 1.2, vol: 0.18, delay: 0.16 });
      break;
    case 'casualty': // 인명 피해 — 짧고 둔한 낙하음
      tone(150, 0.12, { vol: 0.2, slide: -60 });
      noiseBurst(0.08, { filter: 420, q: 0.8, vol: 0.18, delay: 0.02 });
      break;
    case 'moraleBreak': // 대열 붕괴 — 내려가는 뿔나팔
      tone(196, 0.7, { type: 'sawtooth', vol: 0.16, slide: -62, attack: 0.09 });
      tone(147, 0.6, { type: 'sawtooth', vol: 0.1, delay: 0.24, slide: -40, attack: 0.1 });
      break;
    case 'lootCrash': // 약탈 — 창고 문 부서지는 소리 + 곡물 쏟아짐
      noiseBurst(0.07, { filter: 1500, q: 1, vol: 0.28 });
      tone(120, 0.16, { vol: 0.2, slide: -44, delay: 0.02 });
      noiseBurst(0.32, { filter: 900, q: 0.5, vol: 0.12, delay: 0.14, attack: 0.06 });
      break;
    case 'wallHit': // 방어선 붕괴 — 무겁게 무너지는 충격음
      tone(64, 0.42, { vol: 0.4, slide: -20 });
      noiseBurst(0.28, { filter: 240, q: 0.6, vol: 0.34 });
      noiseBurst(0.4, { filter: 1100, q: 0.5, vol: 0.14, delay: 0.08, attack: 0.05 });
      break;
  }
}

// ── 전투 북 루프: 전술 전투 연출(simulating) 동안 낮게 깔리는 군고(軍鼓) ──

let battleDrumTimer: number | null = null;
let battleDrumBeat = 0;

function battleDrumHit(accent: boolean): void {
  if (!ctx || !master) return;
  noiseBurst(0.1, { filter: 210, q: 0.7, vol: accent ? 0.34 : 0.2 });
  tone(78, 0.24, { vol: accent ? 0.36 : 0.22, slide: -22 });
}

export function setBattleDrums(active: boolean): void {
  if (!active) {
    if (battleDrumTimer != null) {
      clearInterval(battleDrumTimer);
      battleDrumTimer = null;
    }
    return;
  }
  if (battleDrumTimer != null || !ctx || !master) return;
  battleDrumBeat = 0;
  battleDrumHit(true);
  battleDrumTimer = window.setInterval(() => {
    battleDrumBeat = (battleDrumBeat + 1) % 4;
    battleDrumHit(battleDrumBeat === 0);
  }, 640);
}

// ── 바람 앰비언트: 악천후 동안 낮게 깔리는 루프 ──

function startWindLoop(): void {
  if (!ctx || !master || !noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 420;
  f.Q.value = 0.4;
  // LFO 변조(windMod)와 날씨 엔벨로프(windGain)를 직렬로 분리한다.
  // 엔벨로프가 0이면 LFO가 어떻든 최종 출력은 무음이 된다.
  const windMod = ctx.createGain();
  windMod.gain.value = 1; // 기준 1에서 ±0.35 흔들려 0.65~1.35
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.14; // 느린 LFO로 바람이 밀려왔다 물러가는 느낌
  const lfoAmp = ctx.createGain();
  lfoAmp.gain.value = 0.35;
  lfo.connect(lfoAmp).connect(windMod.gain);

  windGain = ctx.createGain();
  windGain.gain.value = 0; // 날씨 엔벨로프 (0이면 완전 무음)

  src.connect(f).connect(windMod).connect(windGain).connect(master);
  src.start();
  lfo.start();
}

// 날씨에 맞춰 바람 세기를 조절 (매 프레임 불러도 안전)
export function setWeatherAmbient(weather: WeatherId): void {
  if (!ctx || !windGain) return;
  const target =
    weather === 'blizzard' ? 0.4 :
    weather === 'coldSnap' ? 0.22 :
    weather === 'heavySnow' ? 0.14 : 0;
  if (target === windTarget) return;
  windTarget = target;
  const now = ctx.currentTime;
  // 현재 값에서 목표로 부드럽게 램프 (엔벨로프에는 LFO가 섞이지 않으므로 0까지 확실히 내려간다)
  windGain.gain.cancelScheduledValues(now);
  windGain.gain.setValueAtTime(windGain.gain.value, now);
  windGain.gain.linearRampToValueAtTime(target, now + 2.5);
}
