import fs from "node:fs";
import path from "node:path";
import buffer from "@turf/buffer";

const BUFFER_DISTANCE_KM = 100;
const inputPath = path.resolve(process.cwd(), "public", "india.geojson");
const outputPath = path.resolve(
  process.cwd(),
  "public",
  "india_expanded.geojson",
);

if (!fs.existsSync(inputPath)) {
  throw new Error(`Input file not found: ${inputPath}`);
}

const india = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
const expanded = buffer(india, BUFFER_DISTANCE_KM, {
  units: "kilometers",
  steps: 64,
});

fs.writeFileSync(outputPath, JSON.stringify(expanded));

console.log(`Done: India expanded by ${BUFFER_DISTANCE_KM}km`);
console.log(`Input:  ${inputPath}`);
console.log(`Output: ${outputPath}`);
