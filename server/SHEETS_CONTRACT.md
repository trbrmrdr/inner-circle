# Google Sheets contract

This file is the quick sync point between:

- `tools/google-workspace/apps-script/Config.gs`
- `server/src/sheets/GoogleSheetsService.ts`
- `server/src/sheets/SheetsSchema.ts`
- `server/scripts/sync-google-sheets.ts`

Run this before enabling autoposting on a local machine or VPS:

```bash
npm run sheets:check
npm run sheets:sync
```

For another copied project:

```bash
npm run sheets:check -- --spreadsheet-id <sheet-id> --credentials <service-account-json>
npm run sheets:sync -- --spreadsheet-id <sheet-id> --posts-sheet POSTS --media-sheet MEDIA
```

Grid rule: every synced sheet is resized to keep one blank row and one blank column after the required/used area. Change this with `--grid-padding-rows` and `--grid-padding-columns`. Use `--no-trim-grid` for expand-only mode.

## Sheets

| Purpose | Sheet |
| --- | --- |
| Autopost queue | `POSTS` |
| Media catalog | `MEDIA` |
| Site leads | `LEADS` |
| Server logs | `LOGS` |
| Runtime settings | `SETTINGS` |

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
