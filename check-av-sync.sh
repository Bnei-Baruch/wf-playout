#!/bin/bash
# Measure A/V skew on a packager-clipped HLS asset.
#
# The packager cuts audio sample-accurately at clipFrom but only cuts video at an H.264
# keyframe, advancing the video cut to the next one and rebasing both tracks to ~0. The
# resulting skew is exactly the difference between the audio and video rendition durations,
# so summing #EXTINF on each is a complete measurement — no ffprobe or download needed.
#
# A keyframe-aligned clipFrom must measure 0 ms.
#
# Usage:
#   ./check-av-sync.sh <file_path> <clipFrom_ms> [clipTo_ms]
#
# Example:
#   ./check-av-sync.sh 2016/11/11/mlt_s_rav_2016-11-11_lesson_full.mp4 966000   # -> 720 ms
#   ./check-av-sync.sh 2016/11/11/mlt_s_rav_2016-11-11_lesson_full.mp4 965720   # -> 0 ms

set -u

SRC_HLS_URL="${SRC_HLS_URL:-https://src.bbdomain.org}"

if [ $# -lt 2 ]; then
  sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi

FILE_PATH="$1"
CLIP_FROM="$2"
CLIP_TO="${3:-$((CLIP_FROM + 30000))}"

BASE="${SRC_HLS_URL}/${FILE_PATH}/clipFrom/${CLIP_FROM}/clipTo/${CLIP_TO}"

sum_extinf() {
  curl -sS --fail -m 60 "$1" \
    | awk -F'[:,]' '/^#EXTINF:/ {total += $2} END {printf "%.3f", total}'
}

AUDIO=$(sum_extinf "${BASE}/index-a1.m3u8") || { echo "Failed to fetch audio playlist" >&2; exit 1; }
VIDEO=$(sum_extinf "${BASE}/index-v1-a1.m3u8") || { echo "Failed to fetch video playlist" >&2; exit 1; }

if [ -z "$AUDIO" ] || [ -z "$VIDEO" ]; then
  echo "Empty playlist(s) - check the file path and clip range" >&2
  exit 1
fi

echo "file      : ${FILE_PATH}"
echo "clipFrom  : ${CLIP_FROM} ms   clipTo: ${CLIP_TO} ms"
echo "audio     : ${AUDIO} s"
echo "video     : ${VIDEO} s"

# Tolerance is one AAC frame (1024/48000 = 21.3 ms): clipTo almost never lands on an audio
# frame boundary, so the tail contributes a few ms that are not a head offset and do not
# affect lip sync. A missed keyframe, by contrast, costs a whole GOP - hundreds of ms.
awk -v a="$AUDIO" -v v="$VIDEO" 'BEGIN {
  skew = (a - v) * 1000
  ok = (skew > -22 && skew < 22)
  printf "skew      : %+.1f ms  %s\n", skew, ok ? "IN SYNC (within one audio frame)" : "*** VIDEO AHEAD OF AUDIO ***"
  exit ok ? 0 : 2
}'
