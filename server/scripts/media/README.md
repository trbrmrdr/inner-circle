# Media scripts

Host-side media tools for autopost processing.

On the Germany VPS this folder is synced to:

```text
/opt/server.inner-circle-germany/scripts/media
```

and mounted into the Docker container as:

```text
/app/scripts/media
```

Runtime media files must stay in the persistent host volume:

```text
/opt/server.inner-circle-germany/tmp
```

Container paths:

```text
/app/tmp/media
/app/tmp/autopost
/app/tmp/work
/app/tmp/logs
```

Rules:

- Keep source media in `tmp/autopost/<post_id>/<run_id>/source`.
- Keep network-specific output in `tmp/autopost/<post_id>/<run_id>/<network>`.
- Do not write final media only inside the image layer.
- Do not send unsupported files as documents. Convert to the network format or fail before publishing.
- Video normalization should use `ffmpeg` and write MP4 output for Telegram before `sendVideo`.

Telegram video helper:

```bash
/app/scripts/media/telegram-video-normalize.sh input.mov output.mp4
```

Defaults:

```text
TELEGRAM_VIDEO_CRF=23
TELEGRAM_VIDEO_PRESET=veryfast
TELEGRAM_VIDEO_MAX_BOX=1920
```
