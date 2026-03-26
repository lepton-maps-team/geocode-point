import IconZoomIn from "../icons/IconZoomIn";

type Props = {
  onClick: () => void;
};

export default function ZoomInButton({ onClick }: Props) {
  return (
    <button
      type="button"
      className="map-btn"
      onClick={onClick}
      title="Zoom in"
      id="btn-zoom-in">
      <IconZoomIn />
    </button>
  );
}

