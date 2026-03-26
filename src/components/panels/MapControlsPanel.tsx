import HomeButton from "../buttons/HomeButton";
import ZoomInButton from "../buttons/ZoomInButton";
import ZoomOutButton from "../buttons/ZoomOutButton";

type Props = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onHome: () => void;
};

export default function MapControlsPanel({
  onZoomIn,
  onZoomOut,
  onHome,
}: Props) {
  return (
    <div className="map-controls" id="map-controls">
      <ZoomInButton onClick={onZoomIn} />
      <ZoomOutButton onClick={onZoomOut} />
      <HomeButton onClick={onHome} />
    </div>
  );
}

