import IconCheck from "../icons/IconCheck";

type Props = {
  disabled: boolean;
  isLoading: boolean;
  onClick: () => void;
};

export default function ConfirmButton({
  disabled,
  isLoading,
  onClick,
}: Props) {
  return (
    <button
      type="button"
      className="toolbar-confirm-btn"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Move the marker to enable confirmation" : undefined}>
      <span className="toolbar-btn-icon" aria-hidden="true">
        <IconCheck />
      </span>
      {isLoading ? "Fetching..." : "Confirm"}
    </button>
  );
}

