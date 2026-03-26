type Props = {
  open: boolean;
};

export default function StateMandatoryModal({ open }: Props) {
  if (!open) return null;

  return (
    <div
      className="state-mandatory-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="State is mandatory">
      <div className="state-mandatory-dialog">
        <div className="state-mandatory-title">State is mandatory</div>
        <div className="state-mandatory-text">
          Please pass a valid <code>state_name</code> in the URL query (e.g.
          <code>?state_name=Haryana</code>).
        </div>
      </div>
    </div>
  );
}

