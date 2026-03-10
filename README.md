# Geocoding Marker

- Satellite-only Google map
- Places API autocomplete
- Places API details
- Draggable marker with debounced reverse geocoding
- Right panel with lat/lng and parsed geocode fields

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set:

`VITE_GOOGLE_MAPS_API_KEY=...`

3. Run:

```bash
npm run dev
```

## Notes

- No autocomplete history is saved in local storage, session storage, or database.
- For production, deploy on HTTPS (e.g. Vercel) and restrict your API key by referrer and API scope.
