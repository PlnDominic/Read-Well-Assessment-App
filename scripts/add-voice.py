#!/usr/bin/env python3
"""
Adds or replaces one of Sunny's recorded lines with a real recording, for
instance a Ghanaian teacher reading the line aloud.

    python3 scripts/add-voice.py recording.m4a "Tap the ram."

The text must be exactly what Sunny says (src/lib/spoken.ts, or an item's
"Sunny says" box). Any audio file ffmpeg can read works. The script trims the
silence at both ends, saves it as public/voice/<key>.mp3, and updates
src/lib/voiceManifest.json and the clip list in public/sw.js, so the clip is
played instead of the device voice and works offline. Then run `npm test`:
src/lib/voice.test.ts checks it all still fits together.

Needs python3 and ffmpeg.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICE = ROOT / "public" / "voice"
MANIFEST = ROOT / "src" / "lib" / "voiceManifest.json"
SW = ROOT / "public" / "sw.js"
M32 = 0xFFFFFFFF


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def imul(a: int, b: int) -> int:
    return (a * b) & M32


def line_key(text: str) -> str:
    """The same cyrb53 hash as src/lib/voiceKey.ts."""
    h1, h2 = 0xDEADBEEF, 0x41C6CE57
    for ch in [ord(c) for c in normalize(text)]:
        h1 = imul(h1 ^ ch, 2654435761)
        h2 = imul(h2 ^ ch, 1597334677)
    h1 = imul(h1 ^ (h1 >> 16), 2246822507) ^ imul(h2 ^ (h2 >> 13), 3266489909)
    h2 = imul(h2 ^ (h2 >> 16), 2246822507) ^ imul(h1 ^ (h1 >> 13), 3266489909)
    return format(4294967296 * (2097151 & h2) + (h1 & M32), "x").rjust(14, "0")


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    source, text = sys.argv[1], normalize(sys.argv[2])
    key = line_key(text)
    VOICE.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y", "-i", source,
            "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse",
            "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-b:a", "40k", str(VOICE / f"{key}.mp3"),
        ],
        check=True,
    )
    manifest = json.loads(MANIFEST.read_text())
    manifest["clips"][key] = text
    manifest["clips"] = dict(sorted(manifest["clips"].items()))
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n")

    files = sorted(f.name for f in VOICE.glob("*.mp3"))
    rows, row = [], "  "
    for name in files:
        item = f'"{name}", '
        if len(row) + len(item) > 100:
            rows.append(row.rstrip())
            row = "  "
        row += item
    rows.append(row.rstrip().rstrip(","))
    sw = SW.read_text()
    sw, n = re.subn(r"const VOICE_CLIPS = \[\n.*?\n\];", "const VOICE_CLIPS = [\n" + "\n".join(rows) + "\n];", sw, flags=re.S)
    if n != 1:
        sys.exit("Couldn't find the VOICE_CLIPS list in public/sw.js")
    SW.write_text(sw)
    print(f"Saved public/voice/{key}.mp3 for: {text}")


if __name__ == "__main__":
    main()
