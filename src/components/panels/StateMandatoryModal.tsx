type Props = {
  open: boolean;
  isLoading?: boolean;
};

export default function StateMandatoryModal({ open, isLoading = false }: Props) {
  if (!open) return null;

  return (
    <div
      className="state-mandatory-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={isLoading ? "Loading state boundary" : "State is mandatory"}>
      <div className="state-mandatory-dialog">
        {isLoading ? (
          <>
            <div className="state-mandatory-title">Preparing map</div>
            <div className="state-mandatory-text state-mandatory-loading">
              <span className="state-mandatory-spinner" aria-hidden="true" />
              Loading map data...
            </div>
          </>
        ) : (
          <>
            <div className="state-mandatory-title">State is mandatory</div>
            <div className="state-mandatory-text">
              Please pass a valid <code>state_name</code> in the URL query (e.g.
              <code>?state_name=Haryana</code>).
            </div>
          </>
        )}
      </div>
    </div>
  );
}

