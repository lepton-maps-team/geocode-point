export type PlaceSuggestion = {
  title: string;
  content: string;
  placeId?: string;
};

export type PlaceSearchBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export type PlaceDetails = {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
    viewport?: {
      northeast: {
        lat: number;
        lng: number;
      };
      southwest: {
        lat: number;
        lng: number;
      };
    };
  };
};

type PlacesAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      text?: { text?: string };
      structuredFormat?: { mainText?: { text?: string } };
      place?: string;
      placeId?: string;
    };
  }>;
};

type PlacesDetailResponse = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  viewport?: {
    high?: { latitude?: number; longitude?: number };
    low?: { latitude?: number; longitude?: number };
  };
};

export async function searchFromGooglePlaces(
  query: string,
  apiKey: string,
  bounds?: PlaceSearchBounds | null,
): Promise<PlaceSuggestion[]> {
  const requestBody: Record<string, unknown> = {
    input: query,
    includedRegionCodes: ["IN"],
  };

  if (bounds) {
    requestBody.locationRestriction = {
      rectangle: {
        low: {
          latitude: bounds.minLat,
          longitude: bounds.minLng,
        },
        high: {
          latitude: bounds.maxLat,
          longitude: bounds.maxLng,
        },
      },
    };
  }

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error("Autocomplete request failed");
  }

  const data = (await response.json()) as PlacesAutocompleteResponse;
  const suggestions = data.suggestions ?? [];

  return suggestions
    .map((suggestion) => {
      const prediction = suggestion.placePrediction;
      const title =
        prediction?.structuredFormat?.mainText?.text ?? prediction?.text?.text ?? "Unknown";
      const content = prediction?.text?.text ?? "";
      const placeId = prediction?.place?.split("/").pop() ?? prediction?.placeId;

      return {
        title,
        content,
        placeId,
      };
    })
    .filter((suggestion) => Boolean(suggestion.placeId || suggestion.content));
}

export async function getPlaceDetailFromGoogle(
  placeId: string,
  apiKey: string,
): Promise<PlaceDetails> {
  const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location,viewport",
    },
  });

  if (!response.ok) {
    throw new Error("Place details request failed");
  }

  const data = (await response.json()) as PlacesDetailResponse;

  return {
    place_id: data.id ?? placeId,
    name: data.displayName?.text ?? "",
    formatted_address: data.formattedAddress ?? "",
    geometry: {
      location: {
        lat: data.location?.latitude ?? 0,
        lng: data.location?.longitude ?? 0,
      },
      viewport:
        data.viewport?.high && data.viewport?.low
          ? {
              northeast: {
                lat: data.viewport.high.latitude ?? 0,
                lng: data.viewport.high.longitude ?? 0,
              },
              southwest: {
                lat: data.viewport.low.latitude ?? 0,
                lng: data.viewport.low.longitude ?? 0,
              },
            }
          : undefined,
    },
  };
}
