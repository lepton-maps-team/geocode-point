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
import CrosshairOverlay from "./components/panels/CrosshairOverlay";
import FloatingAddressPanel from "./components/panels/FloatingAddressPanel";
import FloatingSearchPanel from "./components/panels/FloatingSearchPanel";
import MapControlsPanel from "./components/panels/MapControlsPanel";
import StateMandatoryModal from "./components/panels/StateMandatoryModal";

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
const COORDINATE_REGEX = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
const INDIA_BOUNDARY_URL = "/india.geojson";
const STATE_BOUNDARY_DIR_URL = "/states/";
const HOME_GEOCODE_CACHE_KEY = "geocoding-marker:home-geocode:v1";
const HOME_GEOCODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getStateNameFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("state_name");
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return trimmed;
  } catch {
    return null;
  }
}

function normalizeStateName(input: string) {
  return input
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function stateNameToSlug(stateName: string) {
  const normalized = normalizeStateName(stateName);
  // Convert spaces to underscores and strip any remaining unsafe chars.
  return normalized
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

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
  properties?: Record<string, unknown>;
};

type IndiaBoundaryFeatureCollection = {
  type: "FeatureCollection";
  features: IndiaBoundaryFeature[];
};

type LatLngBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

function computeLatLngBoundsFromGeoJson(
  boundary: IndiaBoundaryFeatureCollection,
): LatLngBounds | null {
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;

  const update = (lng: number, lat: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  };

  for (const feature of boundary.features || []) {
    const geom: any = feature.geometry;
    if (!geom) continue;

    // Polygon: coordinates = number[][][] (rings -> points -> [lng,lat])
    if (geom.type === "Polygon" && Array.isArray(geom.coordinates)) {
      for (const ring of geom.coordinates) {
        for (const coord of ring) {
          const [lng, lat] = coord as [number, number];
          update(lng, lat);
        }
      }
    }

    // MultiPolygon: coordinates = number[][][][] (polygons -> rings -> points -> [lng,lat])
    if (geom.type === "MultiPolygon" && Array.isArray(geom.coordinates)) {
      for (const poly of geom.coordinates) {
        for (const ring of poly) {
          for (const coord of ring) {
            const [lng, lat] = coord as [number, number];
            update(lng, lat);
          }
        }
      }
    }
  }

  if (
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLat) ||
    !Number.isFinite(minLng) ||
    !Number.isFinite(maxLng)
  ) {
    return null;
  }

  return { minLat, maxLat, minLng, maxLng };
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

export default function App() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const greyDotIconRef = useRef<any>(null);
  const confirmedMarkerRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);

  const [markerPosition, setMarkerPosition] =
    useState<Coordinates>(DEFAULT_CENTER);
  const [geocodeData, setGeocodeData] = useState<ParsedGeocode | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isMapInteracting, setIsMapInteracting] = useState(false);
  const [hasInitializedGeocode, setHasInitializedGeocode] = useState(false);
  const [pendingGeocodePosition, setPendingGeocodePosition] = useState<
    Coordinates | null
  >(null);
  const [hasPendingGeocode, setHasPendingGeocode] = useState(false);
  const confirmedGeocodePositionRef = useRef<Coordinates>(DEFAULT_CENTER);
  const pendingGeocodePositionRef = useRef<Coordinates | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [indiaBoundary, setIndiaBoundary] =
    useState<IndiaBoundaryFeatureCollection | null>(null);
  const [boundaryLabel, setBoundaryLabel] = useState<string>("India");
  const [homePosition, setHomePosition] = useState<Coordinates>(DEFAULT_CENTER);
  const [isStateMandatoryModalOpen, setIsStateMandatoryModalOpen] = useState(
    false,
  );

  const debouncedSearchInput = useDebouncedValue(searchInput, 350);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      const stateNameRaw = getStateNameFromUrl();
      const stateName = stateNameRaw ? normalizeStateName(stateNameRaw) : null;

      // Default: whole India.
      if (!stateName) {
        setBoundaryLabel("India");
        setHomePosition(DEFAULT_CENTER);
        try {
          const response = await fetch(INDIA_BOUNDARY_URL);
          if (!response.ok) throw new Error("Unable to load India boundary data.");
          const data = (await response.json()) as IndiaBoundaryFeatureCollection;
          if (!isMounted) return;
          setIndiaBoundary(data);
        } catch {
          if (!isMounted) return;
          setLoadError(
            "India boundary data could not be loaded. Geocoding restriction cannot be applied.",
          );
        }
        return;
      }

      // State-specific boundary (pre-split in public/states/<slug>.geojson).
      const stateSlug = stateNameToSlug(stateNameRaw ?? stateName);
      const stateUrl = `${STATE_BOUNDARY_DIR_URL}${encodeURIComponent(
        stateSlug,
      )}.geojson`;

      try {
        const response = await fetch(stateUrl);
        if (!response.ok) throw new Error("State boundary not found.");

        const data = (await response.json()) as IndiaBoundaryFeatureCollection;
        if (!isMounted) return;

        const features = (data.features || []) as IndiaBoundaryFeature[];
        if (!features.length) {
          setBoundaryLabel(stateNameRaw || "state");
          setIndiaBoundary(null);
          setIsStateMandatoryModalOpen(true);
          return;
        }

        const firstName =
          (features[0].properties as any)?.name || stateNameRaw || "state";
        setBoundaryLabel(firstName);
        setIndiaBoundary({
          type: "FeatureCollection",
          features,
        });

        const bounds = computeLatLngBoundsFromGeoJson({
          type: "FeatureCollection",
          features,
        });
        if (bounds) {
          setHomePosition({
            lat: (bounds.minLat + bounds.maxLat) / 2,
            lng: (bounds.minLng + bounds.maxLng) / 2,
          });
        } else {
          setHomePosition(DEFAULT_CENTER);
        }
      } catch {
        if (!isMounted) return;
        setBoundaryLabel(stateNameRaw || "state");
        setIndiaBoundary(null);
        setIsStateMandatoryModalOpen(true);
      }
    };

    void run();

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
    const interactingRef = { current: false };

    const setInteracting = (next: boolean) => {
      if (interactingRef.current === next) return;
      interactingRef.current = next;
      setIsMapInteracting(next);
    };

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

        const pendingMarker = new g.maps.Marker({
          position: DEFAULT_CENTER,
          map,
          draggable: false,
          title: "Current marker (pending)",
          zIndex: 11,
        });

        const greyDotIcon = {
          path: g.maps.SymbolPath.CIRCLE,
          fillColor: "#9ca3af", // grey
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          scale: 7,
        };
        greyDotIconRef.current = greyDotIcon;

        const confirmedMarker = new g.maps.Marker({
          position: DEFAULT_CENTER,
          map,
          draggable: false,
          title: "Previous marker (confirmed)",
          visible: false, // Shown only while there's a pending marker.
          zIndex: 10,
          // Keep the original Google marker style for the confirmed position.
        });

        const geocoder = new g.maps.Geocoder();

        mapInstanceRef.current = map;
        markerRef.current = pendingMarker;
        confirmedMarkerRef.current = confirmedMarker;
        geocoderRef.current = geocoder;

        listeners.push(
          map.addListener("dragstart", () => setInteracting(true)),
        );
        listeners.push(map.addListener("zoom_changed", () => setInteracting(true)));
        listeners.push(
          map.addListener("center_changed", () => setInteracting(true)),
        );
        listeners.push(
          map.addListener("idle", () => {
            setInteracting(false);
            const center = map.getCenter();
            if (!center) return;
            const lat = center.lat();
            const lng = center.lng();
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            pendingMarker.setPosition({ lat, lng });
            setMarkerPosition({ lat, lng });
            setInteractionError(null);
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
    const searchBounds = indiaBoundary
      ? computeLatLngBoundsFromGeoJson(indiaBoundary)
      : null;

    searchFromGooglePlaces(trimmedInput, GOOGLE_MAPS_KEY, searchBounds)
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
  }, [debouncedSearchInput, isMapReady, indiaBoundary]);

  useEffect(() => {
    pendingGeocodePositionRef.current = pendingGeocodePosition;
  }, [pendingGeocodePosition]);

  const reverseGeocodeAtPosition = async (
    position: Coordinates,
  ): Promise<ParsedGeocode> => {
    if (!geocoderRef.current) {
      throw new Error("Geocoder is not ready.");
    }

    const isHomeMarkerPosition = isSameCoordinate(position, DEFAULT_CENTER);
    if (isHomeMarkerPosition) {
      const cachedHomeGeocode = readHomeGeocodeCache();
      if (cachedHomeGeocode) return cachedHomeGeocode;
    }

    return new Promise<ParsedGeocode>((resolve, reject) => {
      geocoderRef.current.geocode(
        { location: { lat: position.lat, lng: position.lng } },
        (results: unknown[], status: string) => {
          if (status !== "OK" || !results) {
            reject(
              new Error(
                "Reverse geocoding failed. Try moving the marker again.",
              ),
            );
            return;
          }

          const parsedData = parseGoogleGeocodeResults(results);
          if (isHomeMarkerPosition) {
            writeHomeGeocodeCache(parsedData);
          }
          resolve(parsedData);
        },
      );
    });
  };

  // One-time initial reverse-geocode so the toolbar starts populated.
  useEffect(() => {
    if (!isMapReady || !indiaBoundary || hasInitializedGeocode) return;

    const run = async () => {
      setIsGeocoding(true);
      setInteractionError(null);
      try {
        if (!isWithinIndia(homePosition, indiaBoundary)) {
          throw new Error(
            `Geocoding is restricted to ${boundaryLabel} only.`,
          );
        }

        const parsed = await reverseGeocodeAtPosition(homePosition);
        confirmedGeocodePositionRef.current = homePosition;
        setGeocodeData(parsed);
      } catch (err: any) {
        setGeocodeData(null);
        setInteractionError(err?.message || "Reverse geocoding failed.");
      } finally {
        setIsGeocoding(false);
        setHasInitializedGeocode(true);
      }
    };

    void run();
  }, [
    isMapReady,
    indiaBoundary,
    hasInitializedGeocode,
    boundaryLabel,
    homePosition,
  ]);

  // Fit map + render the selected boundary polygon(s).
  useEffect(() => {
    if (!isMapReady || !indiaBoundary) return;
    if (!mapInstanceRef.current || !(window as any).google) return;

    const map = mapInstanceRef.current;
    const g: any = (window as any).google;

    const bounds = computeLatLngBoundsFromGeoJson(indiaBoundary);
    if (bounds) {
      const latLngBounds = new g.maps.LatLngBounds(
        new g.maps.LatLng(bounds.minLat, bounds.minLng),
        new g.maps.LatLng(bounds.maxLat, bounds.maxLng),
      );
      map.fitBounds(latLngBounds);
    }

    // Ensure the marker starts at the state "home" position.
    map.setCenter(homePosition);
    map.setZoom(map.getZoom() ?? DEFAULT_ZOOM);
    if (markerRef.current) {
      markerRef.current.setPosition(homePosition);
    }
    setMarkerPosition(homePosition);

    // Render boundary overlay.
    try {
      // Remove any previously rendered geo features.
      map.data.forEach((f: any) => map.data.remove(f));
      map.data.addGeoJson(indiaBoundary as any);
      map.data.setStyle({
        fillColor: "#6366f1",
        fillOpacity: 0.12,
        strokeColor: "#6366f1",
        strokeOpacity: 0.45,
        strokeWeight: 2,
      });
    } catch {
      // Ignore rendering errors; geocoding restriction still works.
    }
  }, [isMapReady, indiaBoundary, boundaryLabel, homePosition]);

  // When marker moves after initialization, store a "pending" position.
  // Reverse geocoding runs only when user clicks Confirm.
  useEffect(() => {
    if (!isMapReady || !indiaBoundary || !hasInitializedGeocode) return;

    const confirmedPos = confirmedGeocodePositionRef.current;

    if (!isWithinIndia(markerPosition, indiaBoundary)) {
      setInteractionError(`Geocoding is restricted to ${boundaryLabel} only.`);
      setGeocodeData(null);
      setHasPendingGeocode(false);
      setPendingGeocodePosition(null);
      return;
    }

    // Clear any restrictions as soon as we're back in bounds.
    setInteractionError(null);

    // Use a slightly looser epsilon for UI "pending" detection so the button
    // reliably appears after a visible map move.
    if (isSameCoordinate(markerPosition, confirmedPos, 1e-5)) {
      setHasPendingGeocode(false);
      setPendingGeocodePosition(null);
      return;
    }

    setPendingGeocodePosition(markerPosition);
    setHasPendingGeocode(true);
  }, [markerPosition, indiaBoundary, isMapReady, hasInitializedGeocode, boundaryLabel]);

  useEffect(() => {
    if (!confirmedMarkerRef.current) return;
    confirmedMarkerRef.current.setVisible(hasPendingGeocode);
    // Keep confirmed marker pinned to the confirmed position while pending.
    if (hasPendingGeocode) {
      confirmedMarkerRef.current.setPosition(
        confirmedGeocodePositionRef.current,
      );
    }

    // While pending, switch the moving marker to the grey dot.
    const pendingMarker = markerRef.current;
    if (pendingMarker) {
      const greyDotIcon = greyDotIconRef.current;
      if (hasPendingGeocode && greyDotIcon) {
        pendingMarker.setIcon(greyDotIcon);
      } else {
        // null restores Google default red marker icon.
        pendingMarker.setIcon(null);
      }
    }
  }, [hasPendingGeocode]);

  const handleConfirmGeocode = async () => {
    if (!pendingGeocodePositionRef.current || !indiaBoundary || !isMapReady)
      return;
    if (isGeocoding) return;

    const positionToConfirm = pendingGeocodePositionRef.current;

    if (!isWithinIndia(positionToConfirm, indiaBoundary)) {
      setInteractionError(`Geocoding is restricted to ${boundaryLabel} only.`);
      setGeocodeData(null);
      setHasPendingGeocode(false);
      setPendingGeocodePosition(null);
      return;
    }

    setIsGeocoding(true);
    setInteractionError(null);

    try {
      const parsed = await reverseGeocodeAtPosition(positionToConfirm);

      // Only apply if the pending position hasn't changed since the click.
      if (
        pendingGeocodePositionRef.current &&
        isSameCoordinate(
          pendingGeocodePositionRef.current,
          positionToConfirm,
          1e-5,
        )
      ) {
        confirmedGeocodePositionRef.current = positionToConfirm;
        if (confirmedMarkerRef.current) {
          confirmedMarkerRef.current.setPosition(positionToConfirm);
          confirmedMarkerRef.current.setVisible(false);
        }
        setGeocodeData(parsed);
        setHasPendingGeocode(false);
        setPendingGeocodePosition(null);
      }
    } catch (err: any) {
      if (
        pendingGeocodePositionRef.current &&
        isSameCoordinate(
          pendingGeocodePositionRef.current,
          positionToConfirm,
          1e-5,
        )
      ) {
        if (confirmedMarkerRef.current) {
          // Keep the previous marker visible until the user cancels or moves again.
          confirmedMarkerRef.current.setVisible(true);
          confirmedMarkerRef.current.setPosition(confirmedGeocodePositionRef.current);
        }
        setGeocodeData(null);
        setInteractionError(err?.message || "Reverse geocoding failed.");
        setHasPendingGeocode(false);
        setPendingGeocodePosition(null);
      }
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleCancelGeocode = () => {
    if (isGeocoding) return;
    const confirmedPos = confirmedGeocodePositionRef.current;

    // Clear pending state.
    pendingGeocodePositionRef.current = null;
    setHasPendingGeocode(false);
    setPendingGeocodePosition(null);

    setInteractionError(null);

    const map = mapInstanceRef.current;
    const pendingMarker = markerRef.current;
    if (map && pendingMarker && confirmedPos) {
      pendingMarker.setPosition(confirmedPos);
      map.panTo(confirmedPos);
      map.setCenter(confirmedPos);
      setMarkerPosition(confirmedPos);
    } else {
      setMarkerPosition(confirmedPos);
    }

    if (confirmedMarkerRef.current) {
      confirmedMarkerRef.current.setVisible(false);
      confirmedMarkerRef.current.setPosition(confirmedPos);
    }
  };

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
        setInteractionError(
          `Selected location is outside ${boundaryLabel}.`,
        );
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
        setInteractionError(`Selected place is outside ${boundaryLabel}.`);
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

  const resetHome = async () => {
    const map = mapInstanceRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    // Cancel any pending preview and restore "confirmed" state to homePosition.
    pendingGeocodePositionRef.current = null;
    setHasPendingGeocode(false);
    setPendingGeocodePosition(null);
    confirmedGeocodePositionRef.current = homePosition;
    if (confirmedMarkerRef.current) {
      confirmedMarkerRef.current.setVisible(false);
      confirmedMarkerRef.current.setPosition(homePosition);
    }

    // Fit map to boundary for the selected state.
    // Important: don't force DEFAULT_ZOOM after fitBounds, otherwise it zooms out
    // and you end up seeing the whole India again.
    let didFitBounds = false;
    if (indiaBoundary) {
      const bounds = computeLatLngBoundsFromGeoJson(indiaBoundary);
      if (bounds) {
        const g: any = (window as any).google;
        if (g?.maps?.LatLngBounds) {
          const latLngBounds = new g.maps.LatLngBounds(
            new g.maps.LatLng(bounds.minLat, bounds.minLng),
            new g.maps.LatLng(bounds.maxLat, bounds.maxLng),
          );
          map.fitBounds(latLngBounds);
          didFitBounds = true;
        } else {
          map.panTo(homePosition);
        }
      } else {
        map.panTo(homePosition);
      }
    } else {
      map.panTo(homePosition);
    }

    if (!didFitBounds) {
      map.setZoom(DEFAULT_ZOOM);
    }
    marker.setPosition(homePosition);
    setMarkerPosition(homePosition);
    setInteractionError(null);

    // Ensure the address corresponds to the home view.
    try {
      if (indiaBoundary && !isWithinIndia(homePosition, indiaBoundary)) return;
      const parsed = await reverseGeocodeAtPosition(homePosition);
      setGeocodeData(parsed);
    } catch (err: any) {
      setGeocodeData(null);
      setInteractionError(err?.message || "Reverse geocoding failed.");
    }
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

  return (
    <main className="app-shell">
      {interactionError && (
        <div
          className="toast toast-error"
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

      <StateMandatoryModal open={isStateMandatoryModalOpen} />

      <div className="content">
        <div className="map-column">
          <div ref={mapRef} className="map-viewport" id="map" />
          <FloatingSearchPanel
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            onClearSearch={handleClearSearch}
            isSearching={isSearching}
            suggestions={suggestions}
            onSuggestionSelect={handleSuggestionSelect}
          />

          <CrosshairOverlay isActive={isMapInteracting} />

          <MapControlsPanel
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onHome={() => void resetHome()}
          />

          <FloatingAddressPanel
            geocodeData={geocodeData}
            isGeocoding={isGeocoding}
            hasPendingGeocode={hasPendingGeocode}
            interactionError={interactionError}
            onConfirm={() => void handleConfirmGeocode()}
            onCancel={handleCancelGeocode}
          />
        </div>
      </div>
    </main>
  );
}
