import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const mediaRoot = path.join(repoRoot, "resources", "Place-Location-Photos");
const outDir = path.join(__dirname, "out", "site-selection-variants");
const tileDir = path.join(outDir, "tiles");

const variants = [
  {
    slug: "01-balanced-people-house",
    title: "01 Balanced: people, house, rooms",
    focus: "A balanced site set: live events first, then house, rooms, food, sauna, territory.",
    items: [
      "downloads/2025-06-07/074.jpg",
      "downloads/2025-06-07/080.jpg",
      "downloads/2025-06-14/AVV_8417.jpg",
      "downloads/2025-06-14/AVV_8419.jpg",
      "downloads/2025-06-14/AVV_8440.jpg",
      "downloads/2025-06-14/AVV_8457.jpg",
      "downloads/2025-06-14/AVV_8477.jpg",
      "downloads/2025-06-14/AVV_8495.jpg",
      "downloads/photo_309.jpg",
      "events/079.jpg",
      "дом_уют/20260614-EQ__7803.jpg",
      "дом_уют/IMG_5447.HEIC",
      "дом/20260614-EQ__7729.jpg",
      "дом/20260614-EQ__7733.jpg",
      "дом-вокруг/IMG_5463.HEIC",
      "место вокруг/20260614-EQ__7719.jpg",
      "место вокруг/20260614-EQ__7776.jpg",
      "old_map_home/photo_36.jpg",
      "old_map_home/photo_37.jpg",
      "old_map_home/photo_40.jpg",
      "old_map_home/photo_43.jpg",
      "old_map_home/photo_44.jpg",
      "old_map_home/photo_45.jpg",
      "old_summer_place/photo_34.jpg",
      "mine/2026-06-17 23.46.49.jpg",
    ],
  },
  {
    slug: "02-social-density",
    title: "02 Social density: more people",
    focus: "More proof of life: children, workshops, backstage, crowd, creative process, fewer empty rooms.",
    items: [
      "downloads/2025-06-07/074.jpg",
      "downloads/2025-06-07/075.jpg",
      "downloads/2025-06-07/079.jpg",
      "downloads/2025-06-07/080.jpg",
      "downloads/2025-06-07/083.jpg",
      "downloads/2025-06-07/086.jpg",
      "downloads/2025-06-07/119.jpg",
      "downloads/2025-06-14/AVV_8356.jpg",
      "downloads/2025-06-14/AVV_8417.jpg",
      "downloads/2025-06-14/AVV_8419.jpg",
      "downloads/2025-06-14/AVV_8436.jpg",
      "downloads/2025-06-14/AVV_8438.jpg",
      "downloads/2025-06-14/AVV_8440.jpg",
      "downloads/2025-06-14/AVV_8457.jpg",
      "downloads/2025-06-14/AVV_8477.jpg",
      "downloads/2025-06-14/AVV_8486.jpg",
      "downloads/2025-06-14/AVV_8495.jpg",
      "downloads/2025-06-14/AVV_8537.jpg",
      "downloads/photo_309.jpg",
      "events/079.jpg",
      "дом_уют/IMG_5446.HEIC",
      "дом/20260614-EQ__7733.jpg",
      "место вокруг/20260614-EQ__7765.jpg",
      "old_map_home/photo_36.jpg",
      "mine/2026-06-17 23.46.49.jpg",
    ],
  },
  {
    slug: "03-house-location",
    title: "03 House and territory",
    focus: "The house as a place: more exterior, rooms and territory, with enough people to avoid an empty-rental feeling.",
    items: [
      "downloads/2025-06-07/074.jpg",
      "downloads/2025-06-14/AVV_8417.jpg",
      "downloads/2025-06-14/AVV_8440.jpg",
      "downloads/photo_309.jpg",
      "events/079.jpg",
      "дом_уют/20260614-EQ__7803.jpg",
      "дом_уют/20260614-EQ__7812.jpg",
      "дом_уют/20260614-EQ__7841.jpg",
      "дом_уют/IMG_5447.HEIC",
      "дом-вокруг/IMG_5327.HEIC",
      "дом-вокруг/IMG_5393.HEIC",
      "дом-вокруг/IMG_5456.HEIC",
      "дом-вокруг/IMG_5463.HEIC",
      "дом/20260614-EQ__7726.jpg",
      "дом/20260614-EQ__7729.jpg",
      "дом/20260614-EQ__7733.jpg",
      "дом/20260614-EQ__7830.jpg",
      "место вокруг/20260614-EQ__7719.jpg",
      "место вокруг/20260614-EQ__7776.jpg",
      "место вокруг/20260614-EQ__7817.jpg",
      "old_map_home/photo_36.jpg",
      "old_map_home/photo_40.jpg",
      "old_map_home/photo_43.jpg",
      "old_map_home/photo_44.jpg",
      "old_summer_place/photo_34.jpg",
    ],
  },
  {
    slug: "04-creative-production",
    title: "04 Creative production",
    focus: "Fashion, photo shoot, music and preparation: the house as a creative base, not only an event venue.",
    items: [
      "downloads/2025-06-14/AVV_8356.jpg",
      "downloads/2025-06-14/AVV_8417.jpg",
      "downloads/2025-06-14/AVV_8419.jpg",
      "downloads/2025-06-14/AVV_8436.jpg",
      "downloads/2025-06-14/AVV_8438.jpg",
      "downloads/2025-06-14/AVV_8440.jpg",
      "downloads/2025-06-14/AVV_8445.jpg",
      "downloads/2025-06-14/AVV_8457.jpg",
      "downloads/2025-06-14/AVV_8465.jpg",
      "downloads/2025-06-14/AVV_8477.jpg",
      "downloads/2025-06-14/AVV_8486.jpg",
      "downloads/2025-06-14/AVV_8488.jpg",
      "downloads/2025-06-14/AVV_8495.jpg",
      "downloads/2025-06-14/AVV_8508.jpg",
      "downloads/2025-06-14/AVV_8537.jpg",
      "downloads/2025-06-14/AVV_8542.jpg",
      "downloads/photo_309.jpg",
      "downloads/2025-06-07/074.jpg",
      "old_map_home/photo_36.jpg",
      "old_map_home/photo_37.jpg",
      "old_map_home/photo_40.jpg",
      "дом_уют/IMG_5447.HEIC",
      "дом/20260614-EQ__7733.jpg",
      "место вокруг/20260614-EQ__7776.jpg",
      "mine/photo_2026-06-19 12.19.37.jpeg",
    ],
  },
  {
    slug: "05-quiet-premium",
    title: "05 Quiet premium",
    focus: "Less noise, more taste: selected people, details, fields, fire, rooms, and a restrained event rhythm.",
    items: [
      "downloads/2025-06-07/074.jpg",
      "downloads/2025-06-07/080.jpg",
      "downloads/2025-06-14/AVV_8417.jpg",
      "downloads/2025-06-14/AVV_8440.jpg",
      "downloads/2025-06-14/AVV_8457.jpg",
      "downloads/photo_309.jpg",
      "events/079.jpg",
      "дом_уют/20260614-EQ__7803.jpg",
      "дом_уют/20260614-EQ__7842.jpg",
      "дом_уют/IMG_5412.HEIC",
      "дом_уют/IMG_5447.HEIC",
      "дом-вокруг/IMG_5327.HEIC",
      "дом-вокруг/IMG_5394.HEIC",
      "дом-вокруг/IMG_5450.HEIC",
      "дом/20260614-EQ__7729.jpg",
      "дом/20260614-EQ__7733.jpg",
      "место вокруг/20260614-EQ__7719.jpg",
      "место вокруг/20260614-EQ__7722.jpg",
      "место вокруг/20260614-EQ__7817.jpg",
      "old_map_home/photo_36.jpg",
      "old_map_home/photo_37.jpg",
      "old_map_home/photo_40.jpg",
      "old_map_home/photo_44.jpg",
      "mine/2026-06-17 23.46.49.jpg",
      "mine/photo_2026-06-19 12.19.37.jpeg",
    ],
  },
];

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")}\n${result.stderr || result.stdout}`);
  }
}

function assertExists(relativePath) {
  const sourcePath = path.join(mediaRoot, relativePath);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing image: ${relativePath}`);
  }
  return sourcePath;
}

function shortLabel(relativePath) {
  return relativePath
    .replace(/^downloads\/2025-06-\d+\//, "")
    .replace(/^downloads\//, "")
    .replace(/^old_map_home\//, "old_map/")
    .replace(/^old_summer_place\//, "old_summer/");
}

function buildTile(sourcePath, label, tilePath) {
  const imagePart = `${tilePath}.image.jpg`;
  const captionPart = `${tilePath}.caption.png`;

  run("magick", [
    sourcePath,
    "-auto-orient",
    "-thumbnail",
    "330x225",
    "-background",
    "white",
    "-gravity",
    "center",
    "-extent",
    "330x225",
    imagePart,
  ]);

  run("magick", [
    "-background",
    "white",
    "-fill",
    "#111111",
    "-font",
    "Helvetica",
    "-pointsize",
    "13",
    "-size",
    "330x58",
    `caption:${label}`,
    captionPart,
  ]);

  run("magick", [imagePart, captionPart, "-append", tilePath]);
  fs.rmSync(imagePart, { force: true });
  fs.rmSync(captionPart, { force: true });
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(tileDir, { recursive: true });

const manifest = [];

for (const variant of variants) {
  if (variant.items.length !== 25) {
    throw new Error(`${variant.slug} must contain 25 images, got ${variant.items.length}`);
  }

  const variantTiles = [];
  const variantManifest = [];

  variant.items.forEach((relativePath, index) => {
    const sourcePath = assertExists(relativePath);
    const number = String(index + 1).padStart(2, "0");
    const tilePath = path.join(tileDir, `${variant.slug}-${number}.jpg`);
    const label = `${variant.slug.slice(0, 2)}-${number}\n${shortLabel(relativePath)}`;

    buildTile(sourcePath, label, tilePath);
    variantTiles.push(tilePath);
    variantManifest.push({
      number,
      source: path.relative(repoRoot, sourcePath),
    });
  });

  const sheetPath = path.join(outDir, `${variant.slug}.jpg`);
  run("magick", [
    "montage",
    ...variantTiles,
    "-background",
    "white",
    "-tile",
    "5x5",
    "-geometry",
    "350x305+10+10",
    sheetPath,
  ]);

  manifest.push({
    title: variant.title,
    focus: variant.focus,
    sheet: path.relative(repoRoot, sheetPath),
    items: variantManifest,
  });
}

fs.writeFileSync(path.join(outDir, "variants.json"), JSON.stringify(manifest, null, 2));
fs.writeFileSync(
  path.join(outDir, "variants.md"),
  [
    "# Site Selection Variants",
    "",
    ...manifest.flatMap((variant) => [
      `## ${variant.title}`,
      "",
      variant.focus,
      "",
      `Sheet: \`${variant.sheet}\``,
      "",
      ...variant.items.map((item) => `- ${item.number}: \`${item.source}\``),
      "",
    ]),
  ].join("\n"),
);

console.log(JSON.stringify({ variants: manifest.length, outDir: path.relative(repoRoot, outDir) }, null, 2));
