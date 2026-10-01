#!/usr/bin/env bash
# Mix music + SFX, two-pass loudness-normalise to -14 LUFS / -1.5 dBTP, mux with the rendered video.
set -euo pipefail
cd "$(dirname "$0")"
python3 audio.py
ffmpeg -v error -y -i build/music.wav -i build/sfx.wav -filter_complex "[0][1]amix=inputs=2:normalize=0:weights='1 1.6'" build/premix.wav
J=$(ffmpeg -hide_banner -i build/premix.wav -af loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json -f null - 2>&1 | sed -n '/{/,/}/p')
M=$(echo "$J" | python3 -c "import json,sys;d=json.load(sys.stdin);print(f\"measured_I={d['input_i']}:measured_TP={d['input_tp']}:measured_LRA={d['input_lra']}:measured_thresh={d['input_thresh']}:offset={d['target_offset']}\")")
ffmpeg -v error -y -i build/premix.wav -af "loudnorm=I=-14:TP=-1.5:LRA=9:linear=true:$M" -ar 48000 build/mix.wav
printf "file 'part%d.mp4'\n" 0 1 2 3 > build/parts.txt
# post: subtle temporal film grain + vignette (too slow to composite per frame in the browser)
ffmpeg -v error -y -f concat -safe 0 -i build/parts.txt -i build/mix.wav -map 0:v -map 1:a \
  -vf "vignette=angle=PI/5:mode=forward,noise=c0s=7:c0f=t+u:c1s=2:c2s=2:allf=t" \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high -c:a aac -b:a 256k -shortest -movflags +faststart kickoff-launch-film.mp4
