#!/usr/bin/env python3
"""
Re-polishes Sunny's recorded clips in public/voice in place: the same shaping
and loudness matching add-voice.py gives every new recording (long pauses
shortened, silence trimmed, every clip at the same loudness with headroom).

    python3 scripts/polish-voice.py              # every clip
    python3 scripts/polish-voice.py KEY [KEY..]  # only these (file names without .mp3)

Use it when clips added at different times sound louder or quieter than each
other. Prefer add-voice.py from the original recording for a new line: each
pass through this script is another round of mp3 compression. Needs ffmpeg.
"""
import importlib.util
import json
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("add_voice", HERE / "add-voice.py")
add_voice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(add_voice)


def main() -> None:
    manifest = json.loads(add_voice.MANIFEST.read_text())["clips"]
    keys = sys.argv[1:] or sorted(manifest)
    unknown = [k for k in keys if k not in manifest]
    if unknown:
        sys.exit(f"Not in the manifest: {', '.join(unknown)}")
    with tempfile.TemporaryDirectory() as tmp:
        for key in keys:
            dest = add_voice.VOICE / f"{key}.mp3"
            source = Path(tmp) / f"{key}.mp3"
            shutil.copy(dest, source)
            add_voice.polish(str(source), dest)
            print(f"polished {key}: {manifest[key][:60]}")


if __name__ == "__main__":
    main()
