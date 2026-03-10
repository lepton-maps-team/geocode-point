import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import {
  parseGoogleGeocodeResults,
  type ParsedGeocode,
} from "./lib/geocodeParser";
import { loadGoogleMaps } from "./lib/googleMapsLoader";
import {
  getPlaceDetailFromGoogle,
  searchFromGooglePlaces,
  type PlaceSuggestion,
} from "./lib/googlePlaces";

type Coordinates = {
  lat: number;
  lng: number;
};

type SearchSuggestion = PlaceSuggestion & {
  coordinates?: Coordinates;
};

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as
  | string
  | undefined;
const DEFAULT_CENTER: Coordinates = { lat: 22.5937, lng: 78.9629 };
const DEFAULT_ZOOM = 5;
const FOCUS_ZOOM = 20;
const GEO_DEBOUNCE_MS = 450;
const COORDINATE_REGEX = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
const INDIA_BOUNDARY_URL = "/india.geojson";
const HOME_GEOCODE_CACHE_KEY = "geocoding-marker:home-geocode:v1";
const HOME_GEOCODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type HomeGeocodeCache = {
  savedAt: number;
  coordinates: Coordinates;
  data: ParsedGeocode;
};

type IndiaBoundaryGeometry =
  | {
      type: "Polygon";
      coordinates: number[][][];
    }
  | {
      type: "MultiPolygon";
      coordinates: number[][][][];
    };

type IndiaBoundaryFeature = {
  type: "Feature";
  geometry: IndiaBoundaryGeometry;
};

type IndiaBoundaryFeatureCollection = {
  type: "FeatureCollection";
  features: IndiaBoundaryFeature[];
};

function formatCoordinate(value: number) {
  return value.toFixed(7);
}

function parseCoordinateInput(value: string): Coordinates | null {
  const match = value.match(COORDINATE_REGEX);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

function isSameCoordinate(a: Coordinates, b: Coordinates, epsilon = 1e-6) {
  return (
    Math.abs(a.lat - b.lat) <= epsilon && Math.abs(a.lng - b.lng) <= epsilon
  );
}

function isWithinIndia(
  position: Coordinates,
  boundary: IndiaBoundaryFeatureCollection | null,
) {
  if (!boundary?.features?.length) return false;

  const candidatePoint = point([position.lng, position.lat]);

  return boundary.features.some((feature) => {
    return booleanPointInPolygon(candidatePoint, feature as any, {
      ignoreBoundary: false,
    });
  });
}

function readHomeGeocodeCache(): ParsedGeocode | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(HOME_GEOCODE_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as HomeGeocodeCache;
    if (!parsed?.savedAt || !parsed?.coordinates || !parsed?.data) return null;
    if (!isSameCoordinate(parsed.coordinates, DEFAULT_CENTER)) return null;
    if (Date.now() - parsed.savedAt > HOME_GEOCODE_TTL_MS) return null;

    return parsed.data;
  } catch {
    return null;
  }
}

function writeHomeGeocodeCache(data: ParsedGeocode) {
  if (typeof window === "undefined") return;

  const payload: HomeGeocodeCache = {
    savedAt: Date.now(),
    coordinates: DEFAULT_CENTER,
    data,
  };

  try {
    window.localStorage.setItem(
      HOME_GEOCODE_CACHE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // Ignore storage failures (e.g., private mode/quota).
  }
}

function getMaxAllowedZoom(
  g: any,
  position: Coordinates,
  fallbackZoom = FOCUS_ZOOM,
): Promise<number> {
  return new Promise((resolve) => {
    try {
      const service = new g.maps.MaxZoomService();
      service.getMaxZoomAtLatLng(
        new g.maps.LatLng(position.lat, position.lng),
        (result: any) => {
          if (result?.status === "OK" && typeof result.zoom === "number") {
            resolve(Math.min(FOCUS_ZOOM, result.zoom));
            return;
          }
          resolve(fallbackZoom);
        },
      );
    } catch {
      resolve(fallbackZoom);
    }
  });
}

async function getCurrentLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
    );
  });
}

function IconSearch() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconZoomIn() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function IconZoomOut() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconMapPin() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function IconX() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconLocate() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
    </svg>
  );
}

export default function App() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);

  const [markerPosition, setMarkerPosition] =
    useState<Coordinates>(DEFAULT_CENTER);
  const [geocodeData, setGeocodeData] = useState<ParsedGeocode | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [indiaBoundary, setIndiaBoundary] =
    useState<IndiaBoundaryFeatureCollection | null>(null);

  const debouncedPosition = useDebouncedValue(markerPosition, GEO_DEBOUNCE_MS);
  const debouncedSearchInput = useDebouncedValue(searchInput, 350);

  useEffect(() => {
    let isMounted = true;

    fetch(INDIA_BOUNDARY_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load India boundary data.");
        }
        return response.json() as Promise<IndiaBoundaryFeatureCollection>;
      })
      .then((data) => {
        if (!isMounted) return;
        setIndiaBoundary(data);
      })
      .catch(() => {
        if (!isMounted) return;
        setLoadError(
          "India boundary data could not be loaded. Geocoding restriction cannot be applied.",
        );
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!GOOGLE_MAPS_KEY) {
      setLoadError(
        "Missing VITE_GOOGLE_MAPS_API_KEY. Please configure it before using the map.",
      );
      return;
    }

    let isMounted = true;
    const listeners: any[] = [];

    loadGoogleMaps(GOOGLE_MAPS_KEY)
      .then(() => {
        if (!isMounted || !window.google || !mapRef.current) return;
        const g = (window as any).google;

        const map = new g.maps.Map(mapRef.current, {
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          mapTypeId: "hybrid",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: false,
          disableDefaultUI: true,
          clickableIcons: false,
          keyboardShortcuts: false,
        });

        const marker = new g.maps.Marker({
          position: DEFAULT_CENTER,
          map,
          draggable: true,
          title: "Drag marker to geocode a location",
        });

        const geocoder = new g.maps.Geocoder();

        mapInstanceRef.current = map;
        markerRef.current = marker;
        geocoderRef.current = geocoder;

        listeners.push(
          map.addListener("click", (event: any) => {
            const lat = event.latLng?.lat?.();
            const lng = event.latLng?.lng?.();
            if (lat == null || lng == null) return;
            marker.setPosition({ lat, lng });
            setMarkerPosition({ lat, lng });
            setInteractionError(null);
          }),
        );

        listeners.push(
          marker.addListener("drag", (event: any) => {
            const lat = event.latLng?.lat?.();
            const lng = event.latLng?.lng?.();
            if (lat == null || lng == null) return;
            setMarkerPosition({ lat, lng });
          }),
        );

        listeners.push(
          marker.addListener("dragend", (event: any) => {
            const lat = event.latLng?.lat?.();
            const lng = event.latLng?.lng?.();
            if (lat == null || lng == null) return;
            setMarkerPosition({ lat, lng });
          }),
        );

        setIsMapReady(true);
      })
      .catch((error: Error) => {
        setLoadError(error.message || "Failed to initialize Google Maps.");
      });

    return () => {
      isMounted = false;
      listeners.forEach((listener) => listener?.remove?.());
    };
  }, []);

  useEffect(() => {
    if (!isMapReady || !GOOGLE_MAPS_KEY) return;
    const trimmedInput = debouncedSearchInput.trim();

    if (trimmedInput.length < 2) {
      setSuggestions([]);
      return;
    }

    const parsedCoordinates = parseCoordinateInput(trimmedInput);
    if (parsedCoordinates) {
      setSuggestions([
        {
          title: "Move to coordinates",
          content: `${parsedCoordinates.lat}, ${parsedCoordinates.lng}`,
          coordinates: parsedCoordinates,
        },
      ]);
      setIsSearching(false);
      return;
    }

    let isCancelled = false;
    setIsSearching(true);

    searchFromGooglePlaces(trimmedInput, GOOGLE_MAPS_KEY)
      .then((results) => {
        if (!isCancelled) setSuggestions(results);
      })
      .catch(() => {
        if (!isCancelled) {
          setSuggestions([]);
          setInteractionError("Autocomplete request failed. Please try again.");
        }
      })
      .finally(() => {
        if (!isCancelled) setIsSearching(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [debouncedSearchInput, isMapReady]);

  useEffect(() => {
    if (!isMapReady || !geocoderRef.current || !indiaBoundary) return;

    if (!isWithinIndia(debouncedPosition, indiaBoundary)) {
      setIsGeocoding(false);
      setGeocodeData(null);
      setInteractionError("Geocoding is restricted to India only.");
      return;
    }

    const isHomeMarkerPosition = isSameCoordinate(
      debouncedPosition,
      DEFAULT_CENTER,
    );
    if (isHomeMarkerPosition) {
      const cachedHomeGeocode = readHomeGeocodeCache();
      if (cachedHomeGeocode) {
        setGeocodeData(cachedHomeGeocode);
        setIsGeocoding(false);
        setInteractionError(null);
        return;
      }
    }

    setIsGeocoding(true);
    setInteractionError(null);

    geocoderRef.current.geocode(
      { location: { lat: debouncedPosition.lat, lng: debouncedPosition.lng } },
      (results: unknown[], status: string) => {
        setIsGeocoding(false);
        if (status !== "OK" || !results) {
          setGeocodeData(null);
          setInteractionError(
            "Reverse geocoding failed. Try moving the marker again.",
          );
          return;
        }
        const parsedData = parseGoogleGeocodeResults(results);
        setGeocodeData(parsedData);
        if (isHomeMarkerPosition) {
          writeHomeGeocodeCache(parsedData);
        }
      },
    );
  }, [debouncedPosition, indiaBoundary, isMapReady]);

  const handleSuggestionSelect = async (suggestion: SearchSuggestion) => {
    const map = mapInstanceRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    if (!indiaBoundary) {
      setInteractionError("India boundary is loading. Please try again.");
      return;
    }

    if (suggestion.coordinates) {
      const { lat, lng } = suggestion.coordinates;
      if (!isWithinIndia({ lat, lng }, indiaBoundary)) {
        setInteractionError("Selected location is outside India.");
        return;
      }
      const g = (window as any).google;
      const targetZoom = await getMaxAllowedZoom(g, { lat, lng });
      map.panTo({ lat, lng });
      map.setCenter({ lat, lng });
      map.setZoom(targetZoom);
      marker.setPosition({ lat, lng });
      setMarkerPosition({ lat, lng });
      setSearchInput(`${lat}, ${lng}`);
      setSuggestions([]);
      setInteractionError(null);
      return;
    }

    if (!GOOGLE_MAPS_KEY || !suggestion.placeId) return;

    try {
      const details = await getPlaceDetailFromGoogle(
        suggestion.placeId,
        GOOGLE_MAPS_KEY,
      );
      const lat = details.geometry.location.lat;
      const lng = details.geometry.location.lng;
      if (!isWithinIndia({ lat, lng }, indiaBoundary)) {
        setInteractionError("Selected place is outside India.");
        return;
      }

      const g = (window as any).google;
      const targetZoom = await getMaxAllowedZoom(g, { lat, lng });
      if (details.geometry.viewport) {
        const bounds = new g.maps.LatLngBounds(
          details.geometry.viewport.southwest,
          details.geometry.viewport.northeast,
        );
        map.fitBounds(bounds);
      }

      map.panTo({ lat, lng });
      map.setCenter({ lat, lng });
      map.setZoom(targetZoom);
      marker.setPosition({ lat, lng });
      setMarkerPosition({ lat, lng });
      setSearchInput(details.formatted_address || suggestion.content);
      setSuggestions([]);
      setInteractionError(null);
    } catch {
      setInteractionError("Place details could not be loaded.");
    }
  };

  const resetHome = () => {
    const map = mapInstanceRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    map.panTo(DEFAULT_CENTER);
    map.setZoom(DEFAULT_ZOOM);
    marker.setPosition(DEFAULT_CENTER);
    setMarkerPosition(DEFAULT_CENTER);
    setInteractionError(null);
  };

  const zoomIn = () => {
    const map = mapInstanceRef.current;
    if (map) {
      map.setZoom((map.getZoom() ?? DEFAULT_ZOOM) + 1);
    }
  };

  const zoomOut = () => {
    const map = mapInstanceRef.current;
    if (map) {
      map.setZoom((map.getZoom() ?? DEFAULT_ZOOM) - 1);
    }
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSuggestions([]);
  };

  const handleLocateUser = async () => {
    setIsLocating(true);
    setInteractionError(null);
    try {
      const coords = await getCurrentLocation();
      if (!isWithinIndia(coords, indiaBoundary)) {
        setInteractionError("Current location is outside India.");
        return;
      }

      const map = mapInstanceRef.current;
      const marker = markerRef.current;
      if (map && marker) {
        const g = (window as any).google;
        const targetZoom = await getMaxAllowedZoom(g, coords);
        map.panTo(coords);
        map.setCenter(coords);
        map.setZoom(targetZoom);
        marker.setPosition(coords);
      }
      setMarkerPosition(coords);
    } catch (err: any) {
      setInteractionError(err.message || "Failed to get current location.");
    } finally {
      setIsLocating(false);
    }
  };

  const renderDataRow = (label: string, value: string | null | undefined) => (
    <div className="data-row">
      <span className="data-key">{label}</span>
      <span className={`data-value${!value ? " empty" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );

  return (
    <main className="app-shell">
      <header className="header" id="app-header">
        <div className="header-brand">
          <div className="brand-icon">
            <IconMapPin />
          </div>
          <span className="brand-title">Geocoding Marker</span>
        </div>

        <div className="header-right">
          <div className="search-container" id="search-container">
            <span className="search-icon">
              <IconSearch />
            </span>
            <input
              id="search-input"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by address, locality, POI, or pincode..."
              className="search-field"
              autoComplete="off"
            />
            {searchInput && (
              <button
                className="search-clear-btn"
                onClick={handleClearSearch}
                title="Clear search">
                <IconX />
              </button>
            )}
            {isSearching && <div className="search-spinner" />}
            {suggestions.length > 0 && (
              <div className="suggestions-dropdown" id="suggestions-list">
                <ul>
                  {suggestions.map((s) => (
                    <li
                      key={`${s.placeId ?? s.content}-${s.coordinates?.lat ?? ""}-${s.coordinates?.lng ?? ""}`}>
                      <button
                        type="button"
                        className="suggestion-btn"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSuggestionSelect(s)}>
                        <span className="title">{s.title}</span>
                        <span className="subtitle">{s.content}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button
            className={`locate-btn ${isLocating ? "loading" : ""}`}
            onClick={handleLocateUser}
            title="Current location">
            <IconLocate />
          </button>
        </div>

        {/* <div className="header-status">
          <div
            className={`security-badge ${isHttps ? "secure" : "insecure"}`}
            id="security-badge">
            {isHttps ? <IconLock /> : <IconUnlock />}
            <span>{isHttps ? "HTTPS Secured" : "Not HTTPS"}</span>
          </div>
        </div> */}
      </header>

      {interactionError && (
        <div
          className="toast toast-warn"
          id="interaction-error-toast"
          role="status"
          aria-live="polite">
          {interactionError}
        </div>
      )}
      {loadError && (
        <div className="alert-bar error" id="load-error">
          {loadError}
        </div>
      )}

      <div className="content">
        <div className="map-column">
          <div ref={mapRef} className="map-viewport" id="map" />
          <div className="map-controls" id="map-controls">
            <button
              type="button"
              className="map-btn"
              onClick={zoomIn}
              title="Zoom in"
              id="btn-zoom-in">
              <IconZoomIn />
            </button>
            <button
              type="button"
              className="map-btn"
              onClick={zoomOut}
              title="Zoom out"
              id="btn-zoom-out">
              <IconZoomOut />
            </button>
            {/* <div className="map-controls-divider" /> */}
            <button
              type="button"
              className="map-btn"
              onClick={resetHome}
              title="Reset to home"
              id="btn-home">
              <IconHome />
            </button>
          </div>
        </div>

        <aside className="side-panel" id="side-panel">
          <div className="panel-section">
            <div className="panel-section-header">
              <IconMapPin />
              <span className="panel-section-title">Marker Position</span>
            </div>
            <div className="coord-grid">
              <div className="coord-card" id="lat-card">
                <div className="coord-label">Latitude</div>
                <div className="coord-value">
                  {formatCoordinate(markerPosition.lat)}
                </div>
              </div>
              <div className="coord-card" id="lng-card">
                <div className="coord-label">Longitude</div>
                <div className="coord-value">
                  {formatCoordinate(markerPosition.lng)}
                </div>
              </div>
            </div>
          </div>

          <div className="panel-section">
            <div className="panel-section-header">
              <IconGlobe />
              <span className="panel-section-title">Geocoding</span>
            </div>
            <div className="status-row" style={{ marginBottom: 12 }}>
              <span
                className={`status-pill ${isGeocoding ? "loading" : "ready"}`}>
                <span
                  className={`status-dot ${isGeocoding ? "loading" : "ready"}`}
                />
                {isGeocoding ? "Resolving..." : "Ready"}
              </span>
            </div>
            <div className="data-rows" id="geocode-data">
              {renderDataRow("Pincode", geocodeData?.pincode)}
              {renderDataRow("State", geocodeData?.state)}
              {renderDataRow("City", geocodeData?.city)}
              {renderDataRow("District", geocodeData?.district)}
              {renderDataRow("Tehsil", geocodeData?.tehsil)}
              {renderDataRow("Address", geocodeData?.formattedAddress)}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
