export type ParsedGeocode = {
  pincode: string | null;
  state: string | null;
  city: string | null;
  district: string | null;
  tehsil: string | null;
  formattedAddress: string | null;
  placeId: string | null;
  rawResults: unknown[];
};

type AddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type GeocoderResultLite = {
  formatted_address?: string;
  place_id?: string;
  address_components?: AddressComponent[];
  geometry?: {
    location_type?: string;
  };
};

const LOCATION_TYPE_PRIORITY: Record<string, number> = {
  ROOFTOP: 0,
  RANGE_INTERPOLATED: 1,
  GEOMETRIC_CENTER: 2,
  APPROXIMATE: 3,
};

function getLocationTypeRank(locationType?: string) {
  if (!locationType) return Number.MAX_SAFE_INTEGER;
  return LOCATION_TYPE_PRIORITY[locationType] ?? Number.MAX_SAFE_INTEGER;
}

function pickBestGeocodeResult(results: GeocoderResultLite[]) {
  if (!results.length) return null;

  let bestResult: GeocoderResultLite | null = null;
  let bestRank = Number.MAX_SAFE_INTEGER;

  for (const result of results) {
    const rank = getLocationTypeRank(result.geometry?.location_type);
    // Keep the first result for ties in the same priority bucket.
    if (rank < bestRank) {
      bestResult = result;
      bestRank = rank;
    }
  }

  // Fallback: if all location_type values are unknown/missing, use first result.
  return bestResult ?? results[0];
}

export function parseGoogleGeocodeResults(results: unknown[]): ParsedGeocode {
  let pincode: string | null = null;
  let state: string | null = null;
  let city: string | null = null;
  let district: string | null = null;
  let tehsil: string | null = null;

  const typedResults = (results ?? []) as GeocoderResultLite[];
  const bestResult = pickBestGeocodeResult(typedResults);

  typedResults.forEach((result) => {
    (result.address_components ?? []).forEach((component) => {
      const types = component.types ?? [];

      if (types.includes("postal_code")) {
        pincode = component.short_name;
      } else if (types.includes("locality") && types.includes("political")) {
        city = component.long_name;
      } else if (
        types.includes("administrative_area_level_2") &&
        types.includes("political")
      ) {
        district = component.long_name;
      } else if (
        types.includes("administrative_area_level_1") &&
        types.includes("political")
      ) {
        state = component.long_name;
      } else if (
        types.includes("administrative_area_level_3") &&
        types.includes("political")
      ) {
        tehsil = component.long_name;
      }
    });
  });

  return {
    pincode,
    state,
    city,
    district,
    tehsil,
    formattedAddress: bestResult?.formatted_address ?? null,
    placeId: bestResult?.place_id ?? null,
    rawResults: typedResults,
  };
}
