# Google Sheets contract

This file is the quick sync point between:

- `tools/google-workspace/apps-script/Config.gs`
- `server/src/sheets/GoogleSheetsService.ts`
- `server/src/sheets/SheetsSchema.ts`
- `server/scripts/sync-google-sheets.ts`

Run this before enabling autoposting. The script runs from this project and checks the remote Google Sheet configured by the active env file:

```bash
npm run sheets:check
npm run sheets:sync
```

For another copied project:

```bash
npm run sheets:check -- --spreadsheet-id <sheet-id> --credentials <service-account-json>
npm run sheets:sync -- --spreadsheet-id <sheet-id> --posts-sheet POSTS --media-sheet MEDIA
```

Grid rule: sync keeps every managed sheet compact by default. It reads the actually used values, creates missing rows/columns when needed, and trims empty trailing rows/columns so the grid ends at the required/used area plus one blank row and one blank column. It must not shrink below existing non-empty data. Change padding with `--grid-padding-rows` and `--grid-padding-columns`. Use `--no-trim-grid` only when you explicitly want expand-only behavior.

## Sheets

| Purpose | Sheet |
| --- | --- |
| Autopost queue | `POSTS` |
| Media catalog | `MEDIA` |
| Site leads | `LEADS` |
| Server logs | `LOGS` |
| Runtime settings | `SETTINGS` |

## LEADS fields used by server

| Field | Required | Source / notes |
| --- | --- | --- |
| `created_at` | yes | Server timestamp. |
| `name` | no | Form field. |
| `phone` | contact | At least one contact field should be present. API may receive digits only; Google Sheets stores/display it as text: `+7 999 000-00-00`. |
| `email` | contact | At least one contact field should be present. |
| `telegram` | contact | Optional `@username`. At least one contact field should be present. Frontend/server validate only username format; they do not verify account existence. |
| `date` | no | Form date/day preference. |
| `guests` | no | Form guests count/range. |
| `scenario` | no | Form scenario/comment selection. |
| `consent` | no | Form consent flag. |
| `meta_json` | no | Compact JSON with extra frontend/captcha metadata. |

Runtime rule: `GoogleSheetsService.AppendLead` writes by header names. On the first lead after process start it checks `LEADS`, creates the sheet if missing, and appends missing server columns without deleting or reordering existing user columns.

Phone display rule: `GoogleSheetsService.AppendLead` writes new lead phones with `valueInputOption=RAW`, so Google Sheets must not convert them to numbers/scientific notation. `npm run sheets:sync` also formats the `LEADS.phone` column as plain text, sets a readable width, and rewrites existing numeric phones to `+7 999 000-00-00` where possible.

Legacy lead columns after this contract cleanup: `lead_uid`, `message`, `page`, `source`. Normal `sheets:sync` does not delete columns. If these columns already exist in a live Google Sheet, delete them manually after checking that the data is no longer needed.

## POSTS fields used by server

| Field | Required | Source / notes |
| --- | --- | --- |
| `post_id` | yes | Main unique post key. |
| `date` | no | Used with `time` if `publish_at` is empty. |
| `time` | no | Used with `date` if `publish_at` is empty. |
| `publish_at` | no | Optional direct datetime override. |
| `status` | yes | Server reads `ready` / `scheduled`; writes `processing`, `posted`, `partial`, `error`. |
| `text` | yes | Source caption before DeepSeek transformation. |
| `platforms` | yes | Comma/newline list: `telegram`, `vk`, `instagram`, `facebook`. |
| `media_ids` | no | Comma/newline list resolved through `MEDIA.media_id`. |
| `post_type` | no | `text`, `image`, `video`, `album`, `reel`, `story`, `carousel`. |
| `attempt` | no | Incremented before each processing attempt. |
| `telegram_message_id` | no | Filled after successful Telegram post. |
| `vk_post_id` | no | Filled after successful VK post. |
| `instagram_media_id` | no | Filled after successful Instagram post. |
| `facebook_post_id` | no | Filled after successful Facebook post. |
| `last_error` | no | Filled on error. |
| `last_response` | no | Compact JSON response array. |
| `updated_at` | no | Last server update timestamp. |

## MEDIA fields used by server

| Field | Required | Notes |
| --- | --- | --- |
| `media_id` | yes | Key referenced by `POSTS.media_ids`. |
| `public_url` | preferred | Best field for Instagram/Facebook/Telegram/VK posting. Must be public HTTPS. |
| `media_url` | optional | Direct media URL fallback. |
| `preview_url` | optional | Preview fallback, usually not enough for final publishing. |
| `drive_url` | optional | Google Drive page URL fallback. |
| `file_id` | optional | Server builds `https://drive.google.com/uc?export=download&id=...`. |

For Instagram and Facebook, media must be a public HTTPS URL. Private Google Drive files will not work for Meta publishing.

## Telegram test autopost

Local command:

```bash
npm run autopost:telegram:test
npm run autopost:telegram:test -- --post-id 0000a --prepare-only --yes
npm run autopost:telegram:test -- --post-id 0000a --yes
```

Rules:

- reads `POSTS` and `MEDIA` once per CLI session and reuses in-memory candidates;
- accepts any post status for test mode: `draft`, `ready`, `posted`, etc.;
- downloads private Google Drive files through the service account into `server/tmp/autopost/<post_id>/<run_id>/source`;
- prepares Telegram-specific files in `server/tmp/autopost/<post_id>/<run_id>/telegram`;
- Telegram photo output is always JPEG media, not documents; HEIC/HEIF sources use `heic-convert` fallback, other image sources are normalized through `sharp`;
- Telegram video output is MP4/MPEG4; non-MP4 videos and oversized MP4 files are normalized through `scripts/media/telegram-video-normalize.sh`;
- Telegram test publishing uses `sendMediaGroup` for 2-10 media items and never uses `sendDocument`;
- writes `manifest.json` in the run folder;
- sends only to `TELEGRAM_TECH_CHAT_ID`;
- never updates Google Sheets in test mode.

`--prepare-only` downloads and prepares media but does not send Telegram messages.
