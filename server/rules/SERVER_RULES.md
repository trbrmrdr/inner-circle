# Server rules

## Architecture

1. The server stays minimal: Express routes call static orchestration classes.
2. No database is used. Google Sheets is the source of queue state, lead state, and publication logs.
3. Every external network has one static class:
   - `TelegramPublisher`
   - `VkPublisher`
   - `InstagramPublisher`
   - `FacebookPublisher`
   - `EmailPublisher`
4. Methods are called directly, for example `TelegramPublisher.PublishPost(task)`.
5. No `getInstance`, no singleton facade, no hidden container.
6. Files should stay below 1000-1500 lines. Split by platform or responsibility before a file grows.
7. Config is explicit and separate per service in `src/config`.
8. Feature checks live inside the static service classes. The orchestrator should stay readable and show the actual flow:

```ts
const prepared = await AiTextHelper.PreparePostText(task);
const results = await Promise.all([
  InstagramPublisher.PublishPost(task, prepared.instagram),
  FacebookPublisher.PublishPost(task, prepared.facebook),
  VkPublisher.PublishPost(task, prepared.vk),
  TelegramPublisher.PublishPost(task, prepared.telegram),
]);
```

The caller should see the platform order in one place. Each publisher decides internally whether it is enabled/configured and returns `disabled`, `skipped`, `ok`, or an error result.

## Parallel operations

- Independent external calls must run in parallel with `Promise.all`.
- Do not wait for Sheets before email, email before Telegram, or one social network before another.
- A service may wait only when its result is a real input for the next step.
- Known dependency: `AiTextHelper.PreparePostText`/DeepSeek runs before publisher calls because prepared text is required by every platform.
- If a channel is optional for a server profile, disable it in env instead of letting a long timeout decide request flow.

## Google Sheets

Recommended sheets:

- `SETTINGS` - key/value controls.
- `POSTS` - autoposting queue.
- `MEDIA` - Google Drive media catalog.
- `LEADS` - incoming site form requests.
- `LOGS` - server events and publication attempts.

Recommended `POSTS` columns:

```text
*date_marker
post_id
date
time
platforms
info/photo/context
text
media_ids
preview_1
preview_2
preview_3
preview_4
preview_5
preview_6
preview_7
preview_8
preview_9
preview_10
status
telegram_status
telegram_lock_until
telegram_published_at
telegram_message_id
telegram_url
telegram_error
telegram_response
```

Statuses:

- empty status - ignored by real autoposting.
- `template` - reusable row/template. Ignored by real autoposting.
- `draft` - normal editable/default state. Ignored by real autoposting.
- `ready` - the only manual status that allows real autoposting.
- `processing` - server is publishing at least one enabled platform.
- `posted` - all enabled requested platforms succeeded.
- `partial` - at least one platform succeeded and at least one failed/skipped.
- `error` - no requested platform succeeded.
- `skipped` - due post had no runnable enabled platform.

Rules:

- `post_id` is our internal unique row key.
- Google Apps Script owns `post_id` generation for editable rows. It builds a readable deterministic ID from `date`, `time`, `platforms`, `text`, and `media_ids`; if one of the required scheduling fields is missing, the script clears `post_id`.
- Once a row is sealed by `processing`, `posted`, `done`, `partial`, or a platform message/post id, Apps Script must not regenerate `post_id`.
- Duplicate or missing `post_id` values are still highlighted red as a safety check.
- Real posting eligibility requires `status=ready` plus `date` + `time` in the publish window.
- `date`, `time`, `platforms`, and `post_id` are required for autoposting. Rows missing any of them are ignored.
- `text` is optional when `media_ids` exists, and `media_ids` is optional when `text` exists. Rows with neither text nor media are ignored.
- Apps Script marks `*date_marker` purple when a `ready` row is invalid and will not publish.
- `autopost.publish_window_minutes` defines how far back the server may publish missed posts after downtime.
- `autopost.future_grace_seconds` defines a small forward tolerance around the current check.
- `media_ids` are resolved through the `MEDIA` sheet.
- `platforms` accepts comma, semicolon, or newline separators. Supported aliases: `telegram`/`tg`/`телеграм`, `vk`/`вк`, `instagram`/`ig`/`inst`, `facebook`/`fb`.
- `MEDIA.media_id` uses readable prefixes: `IMG_001`, `IMG_002`, `VID_0001`, `VID_0002`.
- The media ID prefix is only a human hint. Server media handling must use `MEDIA.type` / `MEDIA.mime_type` / downloaded file metadata.
- `MEDIA.preview_url` is only for spreadsheet preview formulas. It must not be used as a publishing source.
- Platform IDs are written only after successful platform responses.
- Before publishing to a platform, server checks whether that platform ID already exists.
- Each platform owns its own status/id/error/response columns. Current sync creates only Telegram platform columns; VK/Instagram/Facebook columns are added when those publishers are implemented.
- Batch read/write is preferred. Do not update cells one-by-one in loops if a batch is possible.
- Store raw Telegram response in `telegram_response` only as compact JSON.

## Runtime files and Docker

- Docker image contains Node.js, compiled server code, npm dependencies, and base processing tools such as `ffmpeg`.
- Runtime files must live in host-mounted directories, not only inside the container layer.
- Germany standalone compose mounts `${REMOTE_DIR}/tmp` to `/app/tmp`.
- Autopost files use `AUTOPOST_TMP_DIR`, default `/app/tmp/autopost` in Docker and `server/tmp/autopost` locally.
- Media work files use `MEDIA_WORK_DIR`, default `/app/tmp/work` in Docker and `server/tmp/work` locally.
- Private Google Drive media is downloaded to the source folder on the current host before posting. Publishers must use the platform-normalized files from the platform folder, not direct private Drive URLs.
- Host-side processing scripts live in `scripts/media` and are mounted read-only to `/app/scripts/media`.
- Deploy scripts must create `private/tg_sessions`, `tmp/media`, `tmp/autopost`, `tmp/work`, `tmp/logs`, and `scripts/media` before starting Docker.
- Containers should use `restart: unless-stopped`; if the process crashes, Docker restarts it without deleting host-mounted media.
- `tmp` and `private` are excluded from rsync deploy, so deploy/rebuild must not erase downloaded media, converted media, logs, or Telegram sessions.

## Posting policy

General media pipeline:

- Every social network has its own media preparation step because size limits, aspect-ratio rules, codecs, containers, captions, and upload flows differ.
- The source folder keeps original files downloaded from Google Drive.
- The platform folder keeps only files already normalized for the selected network.
- A publisher must not silently downgrade unsupported media to a document/file upload.
- If one media item is missing or cannot be converted to the network format, skip only that media item and keep publishing the remaining valid media/text. Fail the post only when nothing publishable remains.
- After a successful platform publication, delete the temp folder for that exact publication run. If publication fails, keep the folder and manifest for diagnostics.

Telegram:

- Bot API is the default for groups/channels and tech logs.
- MTProto is reserved for account-based posting or future parser tasks.
- Autoposting sends only text, photos, and videos. `sendDocument` is forbidden for autopost media.
- Photo preparation outputs JPEG files for Telegram, including HEIC/HEIF/PNG/WEBP/TIFF sources when conversion is possible.
- Telegram photo rules are enforced before sending: max 10 MB, width + height <= 10000, aspect ratio <= 20.
- Multiple media items are sent as one `sendMediaGroup` album with the prepared text as the first media caption.
- Telegram album/single-media captions are limited to 1024 characters. Long source text must be shortened during Telegram text preparation, not split into document/fallback messages.
- Mixed photo/video posts are still one Telegram album. Telegram chooses the visual grid; the server controls only file normalization, media order, and the first media caption.
- Video preparation outputs MP4/MPEG4 before sending. Non-MP4 videos and oversized MP4 files are normalized through `scripts/media/telegram-video-normalize.sh`.

Instagram:

- Requires Instagram Professional account and Meta token.
- Media must be available by public HTTPS URL.
- Reels/stories/feed/carousel use the Graph API container flow.

VK:

- Direct VK API calls are enough for the first version.
- Photo/video uploads use VK upload server flow before `wall.post`.

Facebook:

- Keep disabled until page and token are ready.
- The class exists so the table schema and runner do not change later.

## Tech Telegram group

- Startup, lead intake, autopost checks, successful posts, and errors go to tech chat.
- `TELEGRAM_STARTUP_STATUS_ENABLED=false` disables only the startup message. Use it for local development so local restarts do not look like VPS restarts.
- Repeating "no posts" status should edit the previous tech message where possible.
- The repeating autopost status is a heartbeat marker only: last check time, window, and whether there are due posts.
- If another tech event appears after the heartbeat marker, the next heartbeat should create a fresh marker below it and delete the old marker when possible.
- Real autopost events must be separate messages:
  - start: UID, row, runnable platforms, planned time, text length, planned media count;
  - success: one message per platform that actually published, with post/message id, URL, media count, and text length;
  - error: one message per platform that actually failed, with UID, row, and the platform error.
- Do not send tech-chat noise for disabled, unconfigured, or non-selected networks.

## DeepSeek

- Text preparation is optional.
- If DeepSeek is disabled or fails, original text is used.
- Use platform-specific output:
  - Telegram: HTML-safe formatting.
  - VK/Facebook/Instagram: plain caption.
- Telegram text preparation uses a platform prompt and chooses the limit by post shape: 4096 characters for text-only posts, 1024 characters for media captions.
- `DEEPSEEK_PROMPT_LANGUAGE=en` is the default because DeepSeek follows the style prompt more reliably in English. Use `DEEPSEEK_PROMPT_LANGUAGE=ru` only for local prompt debugging.
- DeepSeek never publishes. It only transforms/prepares text before publisher calls.
