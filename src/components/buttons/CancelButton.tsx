import IconX from "../icons/IconX";

type Props = {
  disabled: boolean;
  onClick: () => void;
};

export default function CancelButton({ disabled, onClick }: Props) {
  return (
    <button
      type="button"
      className="toolbar-cancel-btn"
      onClick={onClick}
      disabled={disabled}
      title="Cancel and return to the previous marker position">
      <span className="toolbar-btn-icon" aria-hidden="true">
        <IconX />
      </span>
      Cancel
    </button>
  );
}

