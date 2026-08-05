interface MinimapBuildingVisual {
  id: string | number;
  type: string;
  x: number;
  y: number;
  built: boolean;
}

interface MinimapClaimVisual {
  id: string | number;
  siteId: string | number;
  x: number;
  y: number;
  radius: number;
  discovered: boolean;
}

interface MinimapSiteVisual {
  id: string | number;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  status?: string | null;
  factionName?: string | null;
  discovered: boolean;
}

interface MinimapBaseInvalidationInput {
  terrainSignature: number;
  explored: readonly (readonly boolean[])[];
  buildings: readonly MinimapBuildingVisual[];
  claimZones: readonly MinimapClaimVisual[];
  sites: readonly MinimapSiteVisual[];
}

interface MinimapViewportVisual {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface MinimapPointVisual {
  x: number;
  y: number;
}

interface MinimapRaidVisual extends MinimapPointVisual {
  faction?: string;
}

interface MinimapTargetVisual extends MinimapPointVisual {
  key?: string;
  id?: string;
  kind: string;
  radius: number;
  label: string;
  expeditionTarget?: boolean;
}

interface MinimapOverlayInvalidationInput {
  mapWidth: number;
  mapHeight: number;
  viewport: MinimapViewportVisual;
  selected: MinimapPointVisual | null;
  raid: MinimapRaidVisual | null;
  targets: readonly MinimapTargetVisual[];
}

function sortedKey(parts: string[]): string {
  return parts.sort((left, right) => left.localeCompare(right)).join(';');
}

export function minimapBaseInvalidationKey(input: MinimapBaseInvalidationInput): string {
  const exploration = input.explored
    .map(row => row.map(explored => (explored ? '1' : '0')).join(''))
    .join('/');
  const buildings = sortedKey(input.buildings.map(building =>
    `${building.id},${building.type},${building.x},${building.y},${building.built ? 1 : 0}`));
  const claimZones = sortedKey(input.claimZones
    .filter(zone => zone.discovered)
    .map(zone => `${zone.id},${zone.siteId},${zone.x},${zone.y},${zone.radius}`));
  const sites = sortedKey(input.sites
    .filter(site => site.discovered)
    .map(site => [
      site.id,
      site.type,
      site.x,
      site.y,
      site.width,
      site.height,
      site.status ?? '',
      site.factionName ?? '',
    ].join(',')));
  return `${input.terrainSignature}|${exploration}|${buildings}|${claimZones}|${sites}`;
}

export function minimapOverlayInvalidationKey(input: MinimapOverlayInvalidationInput): string {
  const { viewport } = input;
  const selected = input.selected ? `${input.selected.x},${input.selected.y}` : '-';
  const raid = input.raid ? `${input.raid.x},${input.raid.y},${input.raid.faction ?? ''}` : '-';
  const targets = sortedKey(input.targets.map(target => [
    target.key ?? target.id ?? '',
    target.kind,
    target.x,
    target.y,
    target.radius,
    target.label,
    target.expeditionTarget ? 1 : 0,
  ].join(',')));
  return [
    input.mapWidth,
    input.mapHeight,
    viewport.left,
    viewport.top,
    viewport.width,
    viewport.height,
    selected,
    raid,
    targets,
  ].join('|');
}
