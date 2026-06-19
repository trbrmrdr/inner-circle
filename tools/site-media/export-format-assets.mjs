import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const mediaRoot = path.join(repoRoot, "resources", "Place-Location-Photos");
const assetsDir = path.join(repoRoot, "app", "public", "assets", "formats");

const selected = [
  ["site-kids-workshop.webp", "downloads/2025-06-07/074.jpg"],
  ["event-fashion-room.webp", "downloads/2025-06-14/AVV_8417.jpg"],
  ["event-photoshoot-table.webp", "downloads/2025-06-14/AVV_8457.jpg"],
  ["event-hair-close.webp", "downloads/2025-06-14/AVV_8495.jpg"],
  ["music-cello-room.webp", "downloads/photo_309.jpg"],
  ["house-entry-green.webp", "дом_уют/20260614-EQ__7803.jpg"],
  ["house-side-summer.webp", "дом/20260614-EQ__7729.jpg"],
  ["house-facade-meadow.webp", "дом/20260614-EQ__7733.jpg"],
  ["location-valley.webp", "место вокруг/20260614-EQ__7719.jpg"],
  ["hall-main.webp", "old_map_home/photo_36.jpg"],
  ["hall-plants.webp", "old_map_home/photo_37.jpg"],
  ["lounge-fireplace.webp", "old_map_home/photo_40.jpg"],
  ["kitchen-wide.webp", "old_map_home/photo_43.jpg"],
  ["bedroom.webp", "old_map_home/photo_44.jpg"],
  ["sauna-jacuzzi.webp", "old_map_home/photo_45.jpg"],
  ["veranda-winter.webp", "old_summer_place/photo_34.jpg"],
  ["dinner-fire.webp", "mine/2026-06-17 23.46.49.jpg"],
  ["window-light.webp", "mine/photo_2026-06-19 12.19.37.jpeg"],
  ["location-open-view.webp", "место вокруг/20260614-EQ__7765.jpg"],
  ["sunset-field.webp", "downloads/2025-06-07/119.jpg"],
  ["event-prep-team.webp", "downloads/2025-06-14/AVV_8537.jpg"],
  ["house-sunset-field.webp", "дом-вокруг/IMG_5327.HEIC"],
  ["event-makeup-close.webp", "downloads/2025-06-14/AVV_8445.jpg"],
  ["event-fashion-prep.webp", "downloads/2025-06-14/AVV_8419.jpg"],
  ["event-field-model.webp", "downloads/photo_616.jpg"],
  ["event-fashion-stage.webp", "downloads/2025-06-14/AVV_8372.jpg"],
  ["flowers-interface.webp", "downloads/2025-06-14/AVV_8405.jpg"],
  ["event-model-green.webp", "downloads/2025-06-14/AVV_8651.jpg"],
  ["event-model-sunset.webp", "downloads/2025-06-14/AVV_9181.jpg"],
  ["event-dark-detail.webp", "downloads/photo_635.jpg"],
];

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")}\n${result.stderr || result.stdout}`);
  }
}

fs.mkdirSync(assetsDir, { recursive: true });

for (const entry of fs.readdirSync(assetsDir)) {
  if (entry.endsWith(".webp")) {
    fs.rmSync(path.join(assetsDir, entry));
  }
}

const manifest = [];
for (const [fileName, sourceRelativePath] of selected) {
  const sourcePath = path.join(mediaRoot, sourceRelativePath);
  const outputPath = path.join(assetsDir, fileName);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source image: ${sourceRelativePath}`);
  }

  run("magick", [
    sourcePath,
    "-auto-orient",
    "-resize",
    "1800x1800>",
    "-strip",
    "-quality",
    "82",
    "-define",
    "webp:method=6",
    outputPath,
  ]);

  manifest.push({
    file: `/assets/formats/${fileName}`,
    source: path.relative(repoRoot, sourcePath),
  });
}

fs.writeFileSync(path.join(assetsDir, "selection-manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ exported: manifest.length, assetsDir: path.relative(repoRoot, assetsDir) }, null, 2));
