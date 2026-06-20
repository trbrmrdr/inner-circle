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

## Google Sheets

Recommended sheets:

- `settings` - key/value controls.
- `posts` - autoposting queue.
- `leads` - incoming site form requests.
- `logs` - server events and publication attempts.

Recommended `posts` columns:

```text
post_uid
status
publish_at
title
text
media_urls
platforms
post_type
attempt
lock_until
telegram_message_id
telegram_url
vk_post_id
vk_url
instagram_media_id
instagram_url
facebook_post_id
facebook_url
last_error
last_response
updated_at
```

Statuses:

- `draft` - ignore.
- `ready` - can be published when `publish_at` is empty or in the past.
- `processing` - temporary lock while server publishes.
- `published` - all requested platforms succeeded.
- `partial` - at least one platform succeeded and at least one failed/skipped.
- `error` - no requested platform succeeded.

Rules:

- `post_uid` is our internal unique row key.
- Network IDs are written only after successful network responses.
- Before publishing to a platform, server checks whether that platform ID already exists.
- Batch read/write is preferred. Do not update cells one-by-one in loops if a batch is possible.
- Store raw network response in `last_response` only as compact JSON.

## Posting policy

Telegram:

- Bot API is the default for groups/channels and tech logs.
- MTProto is reserved for account-based posting or future parser tasks.

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
- Repeating "no posts" status should edit the previous tech message where possible.

## DeepSeek

- Text preparation is optional.
- If DeepSeek is disabled or fails, original text is used.
- Use platform-specific output:
  - Telegram: HTML-safe formatting.
  - VK/Facebook/Instagram: plain caption.
