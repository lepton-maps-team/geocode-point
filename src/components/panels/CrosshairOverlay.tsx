type Props = {
  isActive: boolean;
};

export default function CrosshairOverlay({ isActive }: Props) {
  return (
    <div
      className={`map-crosshair${isActive ? " active" : ""}`}
      aria-hidden="true">
      <div className="map-crosshair-line horizontal" />
      <div className="map-crosshair-line vertical" />
    </div>
  );
}

