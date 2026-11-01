#!/bin/sh
# Download a finished clip and make a 5-frame check strip: fetch-clip.sh <name> <url>
FF="$TEMP/claude/c--Users-flore-OneDrive-Desktop-projects-final-heaven/1ad201b5-ad2e-4f00-8193-b4b2690ba01c/scratchpad/tools/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe"
cd "$(dirname "$0")/.." && curl -s -o "clips/$1.mp4" "$2" && "$FF" -v error -y -i "clips/$1.mp4" -vf "select='eq(n\,0)+eq(n\,30)+eq(n\,60)+eq(n\,90)+eq(n\,119)',scale=240:-1,tile=5x1" -frames:v 1 "clips/_check/$1.jpg" && echo "$1 ok"
