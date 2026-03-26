import IconHome from "../icons/IconHome";

type Props = {
  onClick: () => void;
};

export default function HomeButton({ onClick }: Props) {
  return (
    <button
      type="button"
      className="map-btn"
      onClick={onClick}
      title="Reset to home"
      id="btn-home">
      <IconHome />
    </button>
  );
}

