#!/usr/bin/env sh
set -eu

if [ "$#" -lt 2 ]; then
  echo "Usage: telegram-video-normalize.sh <input> <output.mp4>" >&2
  exit 2
fi

INPUT="$1"
OUTPUT="$2"
CRF="${TELEGRAM_VIDEO_CRF:-23}"
PRESET="${TELEGRAM_VIDEO_PRESET:-veryfast}"
MAX_BOX="${TELEGRAM_VIDEO_MAX_BOX:-1920}"

mkdir -p "$(dirname "$OUTPUT")"

ffmpeg -y \
  -hide_banner \
  -loglevel error \
  -i "$INPUT" \
  -map 0:v:0 \
  -map 0:a? \
  -vf "scale='min(${MAX_BOX},iw)':'min(${MAX_BOX},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p" \
  -c:v libx264 \
  -preset "$PRESET" \
  -crf "$CRF" \
  -profile:v high \
  -level 4.1 \
  -c:a aac \
  -b:a 128k \
  -movflags +faststart \
  "$OUTPUT"
