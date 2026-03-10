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
};

export function parseGoogleGeocodeResults(results: unknown[]): ParsedGeocode {
  let pincode: string | null = null;
  let state: string | null = null;
  let city: string | null = null;
  let district: string | null = null;
  let tehsil: string | null = null;

  const typedResults = (results ?? []) as GeocoderResultLite[];

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
    formattedAddress: typedResults[0]?.formatted_address ?? null,
    placeId: typedResults[0]?.place_id ?? null,
    rawResults: typedResults,
  };
}
