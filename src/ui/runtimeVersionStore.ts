export interface RuntimeVersionStore {
  getSnapshot: () => number;
  subscribe: (listener: () => void) => () => void;
  publish: () => void;
}

export function createRuntimeVersionStore(): RuntimeVersionStore {
  let version = 0;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => version,
    subscribe: listener => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish: () => {
      version++;
      for (const listener of listeners) listener();
    },
  };
}

export function uiRefreshIntervalMs(speed: number): number {
  if (speed >= 10) return 1_000;
  if (speed >= 3) return 500;
  return 250;
}
