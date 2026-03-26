import IconZoomOut from "../icons/IconZoomOut";

type Props = {
  onClick: () => void;
};

export default function ZoomOutButton({ onClick }: Props) {
  return (
    <button
      type="button"
      className="map-btn"
      onClick={onClick}
      title="Zoom out"
      id="btn-zoom-out">
      <IconZoomOut />
    </button>
  );
}

