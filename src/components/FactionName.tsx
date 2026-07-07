import type { ReactNode } from 'react';
import { FACTIONS } from '../game/constants';

function factionByName(name: string) {
  return FACTIONS.find(f => f.name === name);
}

export function FactionName({ name, className = '' }: { name: string; className?: string }) {
  const faction = factionByName(name);
  return (
    <span
      className={`faction-name${className ? ` ${className}` : ''}`}
      style={faction ? { color: faction.color } : undefined}
      title={faction?.desc}
    >
      {name}
    </span>
  );
}

export function renderFactionText(text: string, factionName: unknown): ReactNode {
  if (typeof factionName !== 'string' || !factionName || !text.includes(factionName)) return text;
  const parts = text.split(factionName);
  return parts.flatMap((part, index) => (
    index === parts.length - 1
      ? [part]
      : [part, <FactionName key={`${factionName}-${index}`} name={factionName} />]
  ));
}
