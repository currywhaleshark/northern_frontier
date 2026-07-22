// 화면 상태에 맞는 스트리밍 BGM 재생기.
// 브라우저 자동재생 정책 때문에 첫 사용자 입력에서 initMusic()을 호출한다.

export type MusicScene = 'title' | 'simulation' | 'battle';

export const MUSIC_TRACKS: Record<MusicScene, readonly string[]> = {
  title: ['/assets/audio/music/title.mp3'],
  simulation: [
    '/assets/audio/music/simulation1.mp3',
    '/assets/audio/music/simulation2.mp3',
    '/assets/audio/music/simulation3.mp3',
    '/assets/audio/music/simulation4.mp3',
    '/assets/audio/music/simulation5.mp3',
    '/assets/audio/music/simulation6.mp3',
    '/assets/audio/music/simulation7.mp3',
  ],
  battle: [
    '/assets/audio/music/battle1.mp3',
    '/assets/audio/music/battle2.mp3',
    '/assets/audio/music/battle3.mp3',
    '/assets/audio/music/battle4.mp3',
  ],
};

const MUSIC_VOLUME = 0.18;
const CROSSFADE_MS = 1_200;

let desiredScene: MusicScene = 'title';
let currentScene: MusicScene | null = null;
let currentAudio: HTMLAudioElement | null = null;
let outgoingAudio: HTMLAudioElement | null = null;
let fadeFrame: number | null = null;
let initialized = false;
let muted = typeof localStorage !== 'undefined' && localStorage.getItem('buksae-muted') === '1';
let volume = 0.7;

const shuffleBags: Partial<Record<MusicScene, string[]>> = {};
const lastTrack: Partial<Record<MusicScene, string>> = {};

function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function nextTrack(scene: MusicScene): string {
  const tracks = MUSIC_TRACKS[scene];
  if (tracks.length === 1) return tracks[0];

  let bag = shuffleBags[scene];
  if (!bag || bag.length === 0) {
    bag = shuffled(tracks);
    const previous = lastTrack[scene];
    if (previous && bag.length > 1 && bag[bag.length - 1] === previous) {
      [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    }
    shuffleBags[scene] = bag;
  }

  const track = bag.pop() ?? tracks[0];
  lastTrack[scene] = track;
  return track;
}

function stopAudio(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
}

function cancelFade(): void {
  if (fadeFrame != null) {
    cancelAnimationFrame(fadeFrame);
    fadeFrame = null;
  }
  stopAudio(outgoingAudio);
  outgoingAudio = null;
}

function crossfade(previous: HTMLAudioElement | null, next: HTMLAudioElement): void {
  cancelFade();
  outgoingAudio = previous;
  const previousVolume = previous?.volume ?? 0;
  const startedAt = performance.now();

  const step = (now: number) => {
    const progress = Math.max(0, Math.min(1, (now - startedAt) / CROSSFADE_MS));
    if (previous) previous.volume = muted ? 0 : previousVolume * (1 - progress);
    next.volume = muted ? 0 : MUSIC_VOLUME * volume * progress;
    if (progress < 1) {
      fadeFrame = requestAnimationFrame(step);
      return;
    }
    stopAudio(previous);
    outgoingAudio = null;
    fadeFrame = null;
  };

  fadeFrame = requestAnimationFrame(step);
}

function startScene(scene: MusicScene, forceNextTrack = false): void {
  if (!initialized) return;
  if (!forceNextTrack && currentAudio && currentScene === scene) return;

  const previous = currentAudio;
  const previousScene = currentScene;
  const audio = new Audio(nextTrack(scene));
  audio.preload = 'auto';
  audio.loop = scene === 'title';
  audio.volume = 0;
  audio.addEventListener('ended', () => {
    if (currentAudio === audio && desiredScene === scene) startScene(scene, true);
  });

  currentAudio = audio;
  currentScene = scene;
  void audio.play()
    .then(() => crossfade(previous, audio))
    .catch(() => {
      // 자동재생이 막힌 경우 다음 사용자 입력의 initMusic()에서 다시 시도한다.
      if (currentAudio === audio) {
        currentAudio = previous;
        currentScene = previousScene;
      }
      stopAudio(audio);
    });
}

export function initMusic(): void {
  initialized = true;
  if (currentAudio) {
    if (currentScene !== desiredScene) {
      startScene(desiredScene);
      return;
    }
    currentAudio.volume = muted ? 0 : MUSIC_VOLUME * volume;
    void currentAudio.play().catch(() => undefined);
    return;
  }
  startScene(desiredScene);
}

export function setMusicScene(scene: MusicScene): void {
  desiredScene = scene;
  if (initialized) startScene(scene);
}

export function setMusicSettings(settings: { enabled: boolean; volume: number }): void {
  muted = !settings.enabled;
  volume = Math.min(1, Math.max(0, Number.isFinite(settings.volume) ? settings.volume : 0.7));
  if (currentAudio) {
    currentAudio.volume = muted ? 0 : MUSIC_VOLUME * volume;
    if (!muted) void currentAudio.play().catch(() => undefined);
  }
  if (outgoingAudio) outgoingAudio.volume = muted ? 0 : MUSIC_VOLUME * volume;
}
