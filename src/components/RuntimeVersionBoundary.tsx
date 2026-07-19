import { useSyncExternalStore, type ReactNode } from 'react';
import type { RuntimeVersionStore } from '../ui/runtimeVersionStore';

interface Props {
  store: RuntimeVersionStore;
  children: (version: number) => ReactNode;
}

export function RuntimeVersionBoundary({ store, children }: Props) {
  const version = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return <>{children(version)}</>;
}
