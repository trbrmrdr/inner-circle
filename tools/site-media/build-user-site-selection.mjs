import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const mediaRoot = path.join(repoRoot, "resources", "Place-Location-Photos");
const variantsPath = path.join(__dirname, "out", "site-selection-variants", "variants.json");
const outDir = path.join(__dirname, "out", "user-site-selection");
const tileDir = path.join(outDir, "tiles");

const requestedRefs = [
  "01-01",
  "01-03",
  "01-06",
  "01-08",
  "01-09",
  "01-11",
  "01-13",
  "01-14",
  "01-16",
  "01-18",
  "01-19",
  "01-20",
  "01-21",
  "01-22",
  "01-23",
  "01-24",
  "01-25",
  "01-23",
  "02-23",
  "02-07",
  "02-14",
  "02-18",
  "02-19",
  "02-22",
  "02-24",
  "03-10",
  "04-25",
  "04-07",
  "04-03",
];

const extraFiles = [
  {
    ref: "extra-photo_616",
    source: "resources/Place-Location-Photos/downloads/photo_616.jpg",
    note: "extra by file name",
  },
  {
    ref: "extra-AVV_8372",
    source: "resources/Place-Location-Photos/downloads/2025-06-14/AVV_8372.jpg",
    note: "extra by file name; duplicate also exists in events/AVV_8372.jpg",
  },
  {
    ref: "extra-AVV_8405",
    source: "resources/Place-Location-Photos/downloads/2025-06-14/AVV_8405.jpg",
    note: "extra by file name; marked for site interface",
  },
  {
    ref: "extra-AVV_8651",
    source: "resources/Place-Location-Photos/downloads/2025-06-14/AVV_8651.jpg",
    note: "extra by file name",
  },
  {
    ref: "extra-AVV_9181",
    source: "resources/Place-Location-Photos/downloads/2025-06-14/AVV_9181.jpg",
    note: "extra by file name",
  },
  {
    ref: "extra-photo_635",
    source: "resources/Place-Location-Photos/downloads/photo_635.jpg",
    note: "extra by file name",
  },
];

const groupRules = [
  {
    slug: "01-events-people",
    title: "События и люди",
    sources: [
      "resources/Place-Location-Photos/downloads/2025-06-07/074.jpg",
      "resources/Place-Location-Photos/downloads/2025-06-07/119.jpg",
      "resources/Place-Location-Photos/downloads/2025-06-14/AVV_8372.jpg",
      "resources/Place-Location-Photos/downloads/2025-06-14/AVV_8417.jpg",
      "resources/Place-Location-Photos/downloads/2025-06-14/AVV_8419.jpg",
      "resources/Place-Location-Photos/downloads/2025-06-14/AVV_8445.jpg",
      "resources/Place-Location-Photos/downloads/2025-06-14/AVV_8457.jpg",
      "resources/Place-Location-Photos/downloads/2025-06-14/AVV_8495.jpg",
      "resources/Place-Location-Photos/downloads/2025-06-14/AVV_8537.jpg",
      "resources/Place-Location-Photos/downloads/2025-06-14/AVV_8651.jpg",
      "resources/Place-Location-Photos/downloads/2025-06-14/AVV_9181.jpg",
      "resources/Place-Location-Photos/downloads/photo_309.jpg",
      "resources/Place-Location-Photos/downloads/photo_616.jpg",
      "resources/Place-Location-Photos/downloads/photo_635.jpg",
    ],
  },
  {
    slug: "02-house-territory",
    title: "Дом и территория",
    sources: [
      "resources/Place-Location-Photos/дом_уют/20260614-EQ__7803.jpg",
      "resources/Place-Location-Photos/дом/20260614-EQ__7729.jpg",
      "resources/Place-Location-Photos/дом/20260614-EQ__7733.jpg",
      "resources/Place-Location-Photos/место вокруг/20260614-EQ__7719.jpg",
      "resources/Place-Location-Photos/место вокруг/20260614-EQ__7765.jpg",
      "resources/Place-Location-Photos/дом-вокруг/IMG_5327.HEIC",
    ],
  },
  {
    slug: "03-rooms-rental",
    title: "Комнаты, залы, аренда",
    sources: [
      "resources/Place-Location-Photos/old_map_home/photo_36.jpg",
      "resources/Place-Location-Photos/old_map_home/photo_37.jpg",
      "resources/Place-Location-Photos/old_map_home/photo_40.jpg",
      "resources/Place-Location-Photos/old_map_home/photo_43.jpg",
      "resources/Place-Location-Photos/old_map_home/photo_44.jpg",
      "resources/Place-Location-Photos/old_map_home/photo_45.jpg",
      "resources/Place-Location-Photos/old_summer_place/photo_34.jpg",
    ],
  },
  {
    slug: "04-mood-interface",
    title: "Настроение и интерфейс",
    sources: [
      "resources/Place-Location-Photos/downloads/2025-06-14/AVV_8405.jpg",
      "resources/Place-Location-Photos/downloads/2025-06-07/080.jpg",
      "resources/Place-Location-Photos/mine/2026-06-17 23.46.49.jpg",
      "resources/Place-Location-Photos/mine/photo_2026-06-19 12.19.37.jpeg",
    ],
  },
];

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")}\n${result.stderr || result.stdout}`);
  }
}

function sourcePath(source) {
  return path.join(repoRoot, source);
}

function fileExists(source) {
  return fs.existsSync(sourcePath(source));
}

function shortLabel(source) {
  return source
    .replace("resources/Place-Location-Photos/", "")
    .replace(/^downloads\/2025-06-\d+\//, "")
    .replace(/^downloads\//, "")
    .replace(/^old_map_home\//, "old_map/")
    .replace(/^old_summer_place\//, "old_summer/");
}

function buildTile(item, index, prefix) {
  const number = String(index + 1).padStart(2, "0");
  const tilePath = path.join(tileDir, `${prefix}-${number}.jpg`);
  const imagePart = `${tilePath}.image.jpg`;
  const captionPart = `${tilePath}.caption.png`;
  const label = `${number} ${item.refs.join(", ")}\n${shortLabel(item.source)}`;

  run("magick", [
    sourcePath(item.source),
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
    "330x65",
    `caption:${label}`,
    captionPart,
  ]);

  run("magick", [imagePart, captionPart, "-append", tilePath]);
  fs.rmSync(imagePart, { force: true });
  fs.rmSync(captionPart, { force: true });
  return tilePath;
}

function buildSheet(items, fileName, columns = 5) {
  const tiles = items.map((item, index) => buildTile(item, index, fileName.replace(/\.jpg$/, "")));
  const sheetPath = path.join(outDir, fileName);

  run("magick", [
    "montage",
    ...tiles,
    "-background",
    "white",
    "-tile",
    `${columns}x`,
    "-geometry",
    "350x312+10+10",
    sheetPath,
  ]);

  return path.relative(repoRoot, sheetPath);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(tileDir, { recursive: true });

const variants = JSON.parse(fs.readFileSync(variantsPath, "utf8"));
const variantByNumber = new Map(
  variants.map((variant, index) => [String(index + 1).padStart(2, "0"), variant]),
);

const rawItems = [];
const missingRefs = [];

for (const ref of requestedRefs) {
  const [variantNumber, itemNumber] = ref.split("-");
  const variant = variantByNumber.get(variantNumber);
  const item = variant?.items.find((candidate) => candidate.number === itemNumber);

  if (!item) {
    missingRefs.push(ref);
    continue;
  }

  rawItems.push({
    ref,
    source: item.source,
    note: "selected by variant ref",
  });
}

for (const item of extraFiles) {
  if (!fileExists(item.source)) {
    missingRefs.push(item.ref);
    continue;
  }
  rawItems.push(item);
}

const bySource = new Map();
for (const item of rawItems) {
  if (!bySource.has(item.source)) {
    bySource.set(item.source, {
      source: item.source,
      refs: [],
      notes: [],
    });
  }
  const target = bySource.get(item.source);
  target.refs.push(item.ref);
  if (item.note) target.notes.push(item.note);
}

const selected = [...bySource.values()].map((item) => ({
  ...item,
  notes: [...new Set(item.notes)],
}));

for (const item of selected) {
  if (!fileExists(item.source)) {
    throw new Error(`Missing selected source: ${item.source}`);
  }
}

const selectedBySource = new Map(selected.map((item) => [item.source, item]));
const grouped = groupRules.map((group) => ({
  ...group,
  items: group.sources
    .map((source) => selectedBySource.get(source))
    .filter(Boolean),
}));

const allSheet = buildSheet(selected, "00-selected-all.jpg", 5);
for (const group of grouped) {
  buildSheet(group.items, `${group.slug}.jpg`, 4);
}

fs.writeFileSync(
  path.join(outDir, "selection.json"),
  JSON.stringify({ selected, grouped, missingRefs }, null, 2),
);

fs.writeFileSync(
  path.join(outDir, "selection.md"),
  [
    "# User Site Photo Selection",
    "",
    "Assumption: `01-02-23` from voice input was interpreted as `02-23`.",
    "",
    `All sheet: \`${allSheet}\``,
    "",
    "## All Selected",
    "",
    ...selected.map((item, index) => {
      const number = String(index + 1).padStart(2, "0");
      const notes = item.notes.length ? ` — ${item.notes.join("; ")}` : "";
      return `- ${number}: ${item.refs.join(", ")} -> \`${item.source}\`${notes}`;
    }),
    "",
    "## Groups",
    "",
    ...grouped.flatMap((group) => [
      `### ${group.title}`,
      "",
      `Sheet: \`tools/site-media/out/user-site-selection/${group.slug}.jpg\``,
      "",
      ...group.items.map((item) => `- ${item.refs.join(", ")} -> \`${item.source}\``),
      "",
    ]),
    missingRefs.length ? `## Missing\n\n${missingRefs.map((ref) => `- ${ref}`).join("\n")}` : "",
  ].join("\n"),
);

console.log(JSON.stringify({ selected: selected.length, groups: grouped.length, outDir: path.relative(repoRoot, outDir), missingRefs }, null, 2));
