# Google Workspace tools for Inner Circle

These scripts use the service account JSON key from `secrets/` by default.
They do not print or copy private key material.

## Install

```bash
cd tools/google-workspace
npm install
```

## Inspect Google Sheet and Drive access

```bash
npm run inspect
```

Reads:

- spreadsheet metadata;
- sheet names and headers;
- first rows of `POSTS`/`MEDIA`;
- Drive file metadata visible to the service account.

It does not download images or videos.

## Build media contact sheets from local files

```bash
npm run media:contact
```

This is the default media-review flow. It reads `MEDIA` from Google Sheets only
to map `media_id` to file names, then creates thumbnails from local files in:

```text
/Users/trbrmrdr/Documents/Project/Inner-Circle/resources/Place-Location-Photos
```

Generated previews are written to `tools/google-workspace/out/`, which is
ignored by git.

Avoid `npm run media:contact:drive` unless local files are unavailable.

## Test write access safely

```bash
npm run inspect:write
```

Writes only to the `_codex_healthcheck` sheet. Posting rows are not changed.

## Inspect Apps Script

First find the script ID:

1. Open the Google Sheet.
2. Go to `Extensions` -> `Apps Script`.
3. Copy the ID from this URL:

```text
https://script.google.com/home/projects/<script-id>/edit
```

Then run:

```bash
node inspect-apps-script.mjs --script-id <script-id>
```

This is read-only and prints file names, file types, function names, and source sizes.
