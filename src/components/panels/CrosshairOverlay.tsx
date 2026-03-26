type Props = {
  isActive: boolean;
  showPendingDot?: boolean;
};

export default function CrosshairOverlay({ isActive, showPendingDot = false }: Props) {
  return (
    <>
      <div
        className={`map-crosshair${isActive ? " active" : ""}`}
        aria-hidden="true">
        <div className="map-crosshair-line horizontal" />
        <div className="map-crosshair-line vertical" />
      </div>
      {showPendingDot && <div className="map-pending-dot" aria-hidden="true" />}
    </>
  );
}

