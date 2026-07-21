import type { DockWindowId } from '../ui/dockPresentation';

const ICON_PATHS: Record<DockWindowId, string> = {
  jobs: '/assets/ui/dock-jobs-v1.png',
  processing: '/assets/ui/dock-processing-v1.png',
  residents: '/assets/ui/dock-residents-v1.png',
  specialResidents: '/assets/ui/dock-special-residents-v1.png',
  factions: '/assets/ui/dock-factions-v1.png',
  court: '/assets/ui/dock-court-v1.png',
  incidents: '/assets/ui/dock-incidents-v1.png',
};

export function ManagementDockIcon({ id }: { id: DockWindowId }) {
  return <img className="management-dock-icon" src={ICON_PATHS[id]} alt="" draggable={false} />;
}
