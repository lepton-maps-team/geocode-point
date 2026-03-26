import fs from "node:fs/promises";
import path from "node:path";

const SOURCE_PATH = "public/indian_state.geojson";
const OUTPUT_DIR = "public/states";
const MARKER_PATH = path.join(OUTPUT_DIR, ".split_marker.json");

function normalizeStateName(input) {
  return input
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function stateNameToSlug(stateName) {
  const normalized = normalizeStateName(stateName);
  return normalized
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function shouldSkip() {
  try {
    const [sourceStat, markerStat] = await Promise.all([
      fs.stat(SOURCE_PATH),
      fs.stat(MARKER_PATH),
    ]);
    return markerStat.mtimeMs >= sourceStat.mtimeMs;
  } catch {
    return false;
  }
}

async function run() {
  const skip = await shouldSkip();
  if (skip) return;

  // Ensure output dir exists.
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const raw = await fs.readFile(SOURCE_PATH, "utf-8");
  const doc = JSON.parse(raw);
  const features = doc?.features || [];

  const buckets = new Map(); // slug -> { displayName, features[] }
  for (const feature of features) {
    const props = feature?.properties || {};
    const name = props?.name;
    if (typeof name !== "string" || !name.trim()) continue;
    const slug = stateNameToSlug(name);
    const bucket = buckets.get(slug) || {
      displayName: name,
      features: [],
    };
    bucket.features.push(feature);
    // Keep first displayName, but if we want better casing, you can update here.
    if (!bucket.displayName) bucket.displayName = name;
    buckets.set(slug, bucket);
  }

  // Write one geojson file per state slug.
  const writePromises = [];
  for (const [slug, bucket] of buckets.entries()) {
    const payload = {
      type: "FeatureCollection",
      features: bucket.features,
    };
    const outPath = path.join(OUTPUT_DIR, `${slug}.geojson`);
    writePromises.push(
      fs.writeFile(outPath, JSON.stringify(payload)),
    );
  }
  await Promise.all(writePromises);

  await fs.writeFile(
    MARKER_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString() }),
  );
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to split state geojson:", err);
  process.exit(1);
});

