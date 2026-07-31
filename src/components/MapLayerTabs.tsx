interface Props {
  attachedToMinimap?: boolean;
  showAquifer: boolean;
  showOre: boolean;
  aquiferAutomatic: boolean;
  oreAutomatic: boolean;
  onToggleAquifer: () => void;
  onToggleOre: () => void;
}

export function MapLayerTabs({
  attachedToMinimap = false,
  showAquifer,
  showOre,
  aquiferAutomatic,
  oreAutomatic,
  onToggleAquifer,
  onToggleOre,
}: Props) {
  return (
    <div className={`map-layer-tabs${attachedToMinimap ? ' minimap-attached' : ''}`} aria-label="지하 자원 레이어">
      <button
        type="button"
        className={`map-layer-tab aquifer${showAquifer ? ' active' : ''}`}
        data-tut="map-layer-aquifer"
        aria-pressed={showAquifer}
        title={aquiferAutomatic
          ? '우물 배치 중 자동 표시 · 청록 강급수 / 파랑 우물급수 / 노랑 부족 / 빨강 미급수'
          : '지하수와 우물 급수권 표시 · 청록 강급수 / 파랑 우물급수 / 노랑 부족 / 빨강 미급수'}
        onClick={onToggleAquifer}
      >
        <span className="map-layer-tab-mark">水</span>
        <span>수맥</span>
        {aquiferAutomatic && <span className="map-layer-tab-auto">자동</span>}
      </button>
      <button
        type="button"
        className={`map-layer-tab ore${showOre ? ' active' : ''}`}
        aria-pressed={showOre}
        title={oreAutomatic ? '갱도 배치 중 자동 표시 · 눌러 상시 표시 전환' : '광물 레이어 켜기/끄기'}
        onClick={onToggleOre}
      >
        <span className="map-layer-tab-mark">鑛</span>
        <span>광맥</span>
        {oreAutomatic && <span className="map-layer-tab-auto">자동</span>}
      </button>
    </div>
  );
}
