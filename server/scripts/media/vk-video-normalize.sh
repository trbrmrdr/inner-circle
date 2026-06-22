#!/usr/bin/env sh
set -eu

if [ "$#" -lt 2 ]; then
  echo "Usage: vk-video-normalize.sh <input> <output.mp4>" >&2
  exit 2
fi

INPUT="$1"
OUTPUT="$2"
CRF="${VK_VIDEO_CRF:-21}"
PRESET="${VK_VIDEO_PRESET:-veryfast}"
MAX_BOX="${VK_VIDEO_MAX_BOX:-1920}"
AUDIO_BITRATE="${VK_VIDEO_AUDIO_BITRATE:-160k}"

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
  -level 4.2 \
  -c:a aac \
  -b:a "$AUDIO_BITRATE" \
  -movflags +faststart \
  "$OUTPUT"
