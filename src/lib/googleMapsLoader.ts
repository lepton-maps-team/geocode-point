declare global {
  interface Window {
    google?: {
      maps?: unknown;
    };
  }
}

let googleMapsPromise: Promise<void> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (!apiKey) {
    return Promise.reject(new Error("Missing Google Maps API key"));
  }

  if (window.google?.maps) {
    return Promise.resolve();
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-google-maps-loader="true"]',
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Failed to load Google Maps script")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      "&libraries=places,marker&v=weekly";
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsLoader = "true";

    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps script"));

    document.head.appendChild(script);
  });

  return googleMapsPromise;
}
