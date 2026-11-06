#!/bin/bash
set -e
cd "$(dirname "$0")"
OUT=/home/user/Test/agentic-ai-video
mkdir -p "$OUT"
ffmpeg -y -v error -framerate 30 -i frames/f_%05d.png -i mix.wav -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -profile:v high -level 4.1 -r 30 -c:a aac -b:a 192k -ar 48000 -t 60 -movflags +faststart "$OUT/agent-vs-agentic-ai-60s.mp4"
ffmpeg -y -v error -i thumb/one_thumb.png -vf scale=1280:720 -q:v 2 "$OUT/thumbnail.jpg"
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,width,height,r_frame_rate -of default=nw=1 "$OUT/agent-vs-agentic-ai-60s.mp4"
