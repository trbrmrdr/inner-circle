# Google Workspace tools for Inner Circle

These scripts use the service account JSON key from `secrets/` by default.
They do not print or copy private key material.

For the full AI/human workflow rules, read:

```text
tools/google-workspace/AI_WORKFLOW_RU.md
```

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

## Apps Script source control

Local Apps Script sources live in:

```text
tools/google-workspace/apps-script/
```

Apps Script reads can use the service account, but Apps Script writes require a
real Google user OAuth token. This is a Google Apps Script API limitation; the
service account that works for Sheets/Drive is not enough for `updateContent`.

Create OAuth credentials once:

1. Open Google Cloud Console for the project that has Apps Script API enabled.
2. Go to `Google Auth platform` -> `Clients`.
3. Create client -> `Desktop app`.
4. Download the JSON.
5. Save it under `secrets/`, for example:

```text
secrets/apps-script-oauth-client.json
```

Authorize the local uploader once:

```bash
npm run apps:auth
```

or, if you want to pass the OAuth client explicitly:

```bash
npm run apps:auth -- --oauth-credentials ../../secrets/apps-script-oauth-client.json
```

This opens a browser, asks you to authorize the Apps Script scope, and saves a
refresh token to:

```text
secrets/apps-script-oauth-token.json
```

Pull the current live script:

```bash
npm run apps:pull
```

Compare local files with the live script:

```bash
npm run apps:diff
```

Validate the upload package without changing Google:

```bash
npm run apps:push -- --dry-run
```

Upload local files to Apps Script:

```bash
npm run apps:push
```

`apps:push` increments `CONTENT_PLANNER_VERSION` in `Config.gs` before a
successful upload. Use `--no-bump` when retrying the same prepared version, or
`--version 1.3.0` to set a specific version.

If Google returns:

```text
User has not enabled the Apps Script API
```

check two things:

- `https://script.google.com/home/usersettings` is enabled for the same Google
  account that ran `apps:auth`;
- `npm run apps:push` is using the OAuth Desktop client JSON, not the service
  account JSON.

## Current Content Planner menu additions

- `Content Planner v... (Контент-планер)` shows the deployed script version.
- `Refresh media usage (Обновить использование медиа)` fills `used_count`,
  `posted_count`, `last_posted_at`, and `used_in_posts`.
- `Sort (Сортировка)` contains POSTS date/time sorting and MEDIA sorting by
  usage or Drive creation date.
- `Delete selected media files (Удалить выбранные медиафайлы)` works only on
  selected rows in `MEDIA`, asks for confirmation, moves Drive files to trash,
  deletes the selected MEDIA rows, and refreshes post previews.
