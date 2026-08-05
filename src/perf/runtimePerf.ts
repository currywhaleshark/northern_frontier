interface RuntimePerfEvent {
  name: string;
  start: number;
  duration: number;
  detail?: Record<string, string | number | boolean | null>;
}

interface RuntimePerfProbe {
  active: boolean;
  startedAt: number;
  stoppedAt?: number;
  maxEvents: number;
  events: RuntimePerfEvent[];
  thresholds: Record<string, number>;
  supportedEntryTypes: string[];
  observedEntryTypes: string[];
}

interface RuntimePerfOptions {
  maxEvents?: number;
  thresholds?: Partial<Record<string, number>>;
}

declare global {
  interface Window {
    __runtimePerf?: RuntimePerfProbe;
    __runtimePerfStartTime?: typeof runtimePerfStartTime;
    __recordRuntimePerfSince?: typeof recordRuntimePerfSince;
  }
}

let observer: PerformanceObserver | null = null;
let memoryTimer: number | null = null;

const DEFAULT_THRESHOLDS: Record<string, number> = {
  pathfinding: 2,
  'game-loop': 1,
};

function appendEvent(probe: RuntimePerfProbe, event: RuntimePerfEvent): void {
  if (!probe.active || event.duration < (probe.thresholds[event.name] ?? 0)) return;
  probe.events.push(event);
  const overflow = probe.events.length - probe.maxEvents;
  if (overflow > 0) probe.events.splice(0, overflow);
}

export function runtimePerfStartTime(): number | null {
  if (typeof window === 'undefined' || !window.__runtimePerf?.active) return null;
  return performance.now();
}

export function recordRuntimePerf(
  name: string,
  start: number,
  duration: number,
  detail?: RuntimePerfEvent['detail'],
): void {
  if (typeof window === 'undefined') return;
  const probe = window.__runtimePerf;
  if (!probe) return;
  appendEvent(probe, { name, start, duration, detail });
}

export function recordRuntimePerfSince(
  name: string,
  start: number | null,
  detail?: RuntimePerfEvent['detail'],
): void {
  if (start == null) return;
  recordRuntimePerf(name, start, performance.now() - start, detail);
}

function stopCollectors(): void {
  observer?.disconnect();
  observer = null;
  if (memoryTimer !== null) window.clearInterval(memoryTimer);
  memoryTimer = null;
}

export function startRuntimePerf(options: RuntimePerfOptions = {}): RuntimePerfProbe {
  stopCollectors();
  const supportedEntryTypes = typeof PerformanceObserver === 'undefined'
    ? []
    : [...PerformanceObserver.supportedEntryTypes];
  const observedEntryTypes = ['longtask', 'long-animation-frame', 'gc']
    .filter(type => supportedEntryTypes.includes(type));
  const probe: RuntimePerfProbe = {
    active: true,
    startedAt: performance.now(),
    maxEvents: Math.max(100, Math.floor(options.maxEvents ?? 20_000)),
    events: [],
    thresholds: { ...DEFAULT_THRESHOLDS },
    supportedEntryTypes,
    observedEntryTypes,
  };
  for (const [name, threshold] of Object.entries(options.thresholds ?? {})) {
    if (threshold != null) probe.thresholds[name] = threshold;
  }
  window.__runtimePerf = probe;

  if (observedEntryTypes.length > 0) {
    observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'long-animation-frame') {
          const loaf = entry as PerformanceEntry & {
            blockingDuration?: number;
            renderStart?: number;
            styleAndLayoutStart?: number;
            scripts?: Array<{
              duration?: number;
              sourceURL?: string;
              functionName?: string;
              invoker?: string;
              forcedStyleAndLayoutDuration?: number;
            }>;
          };
          recordRuntimePerf('long-animation-frame', entry.startTime, entry.duration, {
            blockingDuration: loaf.blockingDuration ?? 0,
            renderStart: loaf.renderStart ?? 0,
            styleAndLayoutStart: loaf.styleAndLayoutStart ?? 0,
            scripts: JSON.stringify((loaf.scripts ?? []).slice(0, 8).map(script => ({
              duration: script.duration ?? 0,
              sourceURL: script.sourceURL ?? '',
              functionName: script.functionName ?? '',
              invoker: script.invoker ?? '',
              forcedStyleAndLayoutDuration: script.forcedStyleAndLayoutDuration ?? 0,
            }))),
          });
        } else {
          recordRuntimePerf(entry.entryType === 'gc' ? 'gc' : 'longtask', entry.startTime, entry.duration, {
            entryType: entry.entryType,
            source: entry.name,
          });
        }
      }
    });
    observer.observe({ entryTypes: observedEntryTypes });
  }

  const memoryPerformance = performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  };
  if (memoryPerformance.memory) {
    const sampleMemory = () => {
      const memory = memoryPerformance.memory!;
      recordRuntimePerf('js-heap', performance.now(), 0, {
        usedBytes: memory.usedJSHeapSize,
        totalBytes: memory.totalJSHeapSize,
        limitBytes: memory.jsHeapSizeLimit,
      });
    };
    sampleMemory();
    memoryTimer = window.setInterval(sampleMemory, 1_000);
  }
  return probe;
}

export function stopRuntimePerf(): RuntimePerfProbe | null {
  if (typeof window === 'undefined') return null;
  const probe = window.__runtimePerf;
  if (!probe) return null;
  probe.active = false;
  probe.stoppedAt = performance.now();
  stopCollectors();
  return probe;
}

export function runtimePerfSnapshot(): RuntimePerfProbe | null {
  if (typeof window === 'undefined' || !window.__runtimePerf) return null;
  return {
    ...window.__runtimePerf,
    events: window.__runtimePerf.events.map(event => ({ ...event, detail: event.detail ? { ...event.detail } : undefined })),
  };
}

export function summarizeRuntimePerf(probe: RuntimePerfProbe | null): Record<string, unknown> | null {
  if (!probe) return null;
  const grouped = new Map<string, number[]>();
  for (const event of probe.events) {
    const values = grouped.get(event.name) ?? [];
    values.push(event.duration);
    grouped.set(event.name, values);
  }
  const rounded = (value: number) => Math.round(value * 1_000) / 1_000;
  const quantile = (values: number[], q: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  };
  const stats = Object.fromEntries([...grouped].map(([name, values]) => [name, {
    count: values.length,
    mean: rounded(values.reduce((sum, value) => sum + value, 0) / values.length),
    p50: rounded(quantile(values, 0.5)),
    p95: rounded(quantile(values, 0.95)),
    p99: rounded(quantile(values, 0.99)),
    max: rounded(Math.max(...values)),
  }]));
  return {
    elapsedMs: rounded((probe.stoppedAt ?? performance.now()) - probe.startedAt),
    eventCount: probe.events.length,
    maxEvents: probe.maxEvents,
    observedEntryTypes: probe.observedEntryTypes,
    gcEntrySupported: probe.supportedEntryTypes.includes('gc'),
    longTaskEntrySupported: probe.supportedEntryTypes.includes('longtask'),
    longAnimationFrameSupported: probe.supportedEntryTypes.includes('long-animation-frame'),
    stats,
    longest: [...probe.events]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 20)
      .map(event => ({ ...event, start: rounded(event.start), duration: rounded(event.duration) })),
  };
}

if (typeof window !== 'undefined') {
  window.__runtimePerfStartTime = runtimePerfStartTime;
  window.__recordRuntimePerfSince = recordRuntimePerfSince;
}
