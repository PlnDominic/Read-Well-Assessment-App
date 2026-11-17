#!/usr/bin/env bash
# Usage: voice-clone/import-clips.sh path/to/unzipped/out
# Feeds every generated clip through scripts/add-voice.py (trim, loudness, manifest, sw.js).
set -euo pipefail
dir="${1:?folder containing lines.json and NNN.wav}"
python3 - "$dir" <<'PY'
import json, subprocess, sys
d = sys.argv[1]
for l in json.load(open(f"{d}/lines.json")):
    subprocess.run(["python3", "scripts/add-voice.py", f"{d}/{l['id']:03d}.wav", l["text"]], check=True)
PY
