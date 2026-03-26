import { useEffect, useState } from "react";
import type { ParsedGeocode } from "../../lib/geocodeParser";
import CancelButton from "../buttons/CancelButton";
import ConfirmButton from "../buttons/ConfirmButton";
import IconCheck from "../icons/IconCheck";
import IconCopy from "../icons/IconCopy";

type Props = {
  geocodeData: ParsedGeocode | null;
  markerPosition: { lat: number; lng: number };
  isGeocoding: boolean;
  hasPendingGeocode: boolean;
  interactionError: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function FloatingAddressPanel({
  geocodeData,
  markerPosition,
  isGeocoding,
  hasPendingGeocode,
  interactionError,
  onConfirm,
  onCancel,
}: Props) {
  const [copiedRecently, setCopiedRecently] = useState(false);
  const isEmpty = !geocodeData?.formattedAddress && !isGeocoding && !hasPendingGeocode;
  const hasAddress = Boolean(geocodeData?.formattedAddress);
  const showCopyIcon = hasAddress && !hasPendingGeocode && !isGeocoding;
  const canCopyAddress = showCopyIcon;
  const panelState = interactionError
    ? "error"
    : isGeocoding
      ? "resolving"
      : hasPendingGeocode
        ? "pending"
        : "ready";
  const statusLabel =
    panelState === "error"
      ? "Issue"
      : panelState === "resolving"
        ? "Resolving"
        : panelState === "pending"
          ? "Pending"
          : "Ready";
  const addressText = isGeocoding
    ? "Resolving address..."
    : hasPendingGeocode
      ? "Confirm to fetch updated address for this marker position."
      : geocodeData?.formattedAddress || "Move the map to place the pin.";
  const helperText = isGeocoding
    ? "Finding the nearest precise location."
    : hasPendingGeocode
      ? "Marker moved. Confirm to save this location."
      : isEmpty
        ? "Address will appear here after confirmation."
        : "Address resolved for the current marker position.";
  const latText = Number.isFinite(markerPosition.lat)
    ? markerPosition.lat.toFixed(6)
    : "—";
  const lngText = Number.isFinite(markerPosition.lng)
    ? markerPosition.lng.toFixed(6)
    : "—";

  useEffect(() => {
    if (!copiedRecently) return;
    const timer = window.setTimeout(() => setCopiedRecently(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copiedRecently]);

  useEffect(() => {
    if (!showCopyIcon && copiedRecently) {
      setCopiedRecently(false);
    }
  }, [showCopyIcon, copiedRecently]);

  const copyAddress = async () => {
    if (!canCopyAddress || !geocodeData?.formattedAddress) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(geocodeData.formattedAddress);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = geocodeData.formattedAddress;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "absolute";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedRecently(true);
    } catch {}
  };

  return (
    <div
      className={`floating-address-dialog state-${panelState}`}
      id="floating-address-dialog"
      role="group"
      aria-busy={isGeocoding}
      aria-label="Address confirmation dialog">
      <div className="floating-address-header">
        <div className="floating-address-title">Address</div>
        <span className={`floating-address-state state-${panelState}`}>{statusLabel}</span>
      </div>
      <div className="floating-address-content">
        <div className="floating-address-row">
          <div
            className={`floating-address-text${isEmpty ? " empty" : ""}`}
            title={addressText}
            aria-live="polite">
            {addressText}
          </div>
          <div className="floating-address-copy-slot">
            {showCopyIcon && (
              <button
                type="button"
                className={`floating-address-copy-btn${copiedRecently ? " copied" : ""}`}
                title="Copy address"
                aria-label={copiedRecently ? "Address copied successfully" : "Copy address"}
                onClick={copyAddress}
                disabled={!canCopyAddress}>
                {copiedRecently ? <IconCheck /> : <IconCopy />}
              </button>
            )}
          </div>
        </div>
        <div className="floating-address-hint">{helperText}</div>
        <div className="floating-address-coords">
          <span>Lat: {latText}</span>
          <span>Lng: {lngText}</span>
        </div>
      </div>

      <div className="floating-address-actions">
        <ConfirmButton
          disabled={!hasPendingGeocode || isGeocoding}
          isLoading={isGeocoding}
          onClick={onConfirm}
        />
        <CancelButton
          disabled={!hasPendingGeocode || isGeocoding}
          onClick={onCancel}
        />
      </div>
    </div>
  );
}

