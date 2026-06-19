# Site media tools for Inner Circle

These scripts work with local photo originals for the website. They do not use
Google Drive and do not download media from Google Workspace.

For the full AI/human workflow rules, read:

```text
tools/site-media/AI_WORKFLOW_RU.md
```

## Source and outputs

Source originals:

```text
resources/Place-Location-Photos/
```

Generated review files:

```text
tools/site-media/out/
```

Website assets:

```text
app/public/assets/formats/
```

Shared Russian catalog partial:

```text
app/src/partials/sections/accordions/details.ru.place-catalog.html
```

`tools/site-media/out/` is ignored by git. The website assets under
`app/public/assets/formats/` are part of the static site and are deployed.

## Requirements

The scripts expect the ImageMagick `magick` command to be available.

They read photos, including HEIC files when ImageMagick supports them. Video is
not used by these site-selection scripts.

## Build full photo contact sheets

```bash
node tools/site-media/build-photo-contact-sheets.mjs
```

Creates small thumbnails and contact sheets for all images under
`resources/Place-Location-Photos/`.

Outputs:

```text
tools/site-media/out/photo-contact-sheets/
```

Use this when you need to inspect the full local photo library quickly without
opening heavy originals.

## Build five site-selection variants

```bash
node tools/site-media/build-site-selection-variants.mjs
```

Creates five curated 25-photo sheets with different emphasis:

- balanced people/house/rooms;
- social density and proof of life;
- house and territory;
- creative production;
- quiet premium mood.

Outputs:

```text
tools/site-media/out/site-selection-variants/
```

The numbered references on these sheets are the IDs used when the user says
something like `01-03` or `04-25`.

## Build the user-approved selection

```bash
node tools/site-media/build-user-site-selection.mjs
```

Takes the selected numbered references and extra file names from the script,
deduplicates them by source path, and creates grouped contact sheets.

Outputs:

```text
tools/site-media/out/user-site-selection/
```

Use this before exporting final website assets, so the selected files can be
checked visually as one set and by site section.

## Export final website assets

```bash
node tools/site-media/export-format-assets.mjs
```

Exports the current final selection to WebP files in:

```text
app/public/assets/formats/
```

Important: this script removes existing `.webp` files from
`app/public/assets/formats/` before exporting the selected set. Do not run it
unless the `selected` array in the script matches the approved website set.

The script also writes:

```text
app/public/assets/formats/selection-manifest.json
```

## After changing assets or HTML

Build the site:

```bash
cd app
npm run build
```

Deploy the site from the repository root:

```bash
bash ./synch_to_server.sh
```

## Safety rules

- Do not edit or delete originals in `resources/Place-Location-Photos/`.
- Do not use Google Drive downloads for this workflow.
- Do not use `old_*` folders for the main aesthetic unless the task explicitly
  needs rooms, rental proof, or old reference material.
- Do not leave exported local assets unused in the site.
- Do not edit the `Досуг, маршруты и занятия` block unless the user explicitly
  asks for that block; it is a separate future catalog.
