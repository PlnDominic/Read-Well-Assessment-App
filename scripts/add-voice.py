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
import os
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


# Shapes a recording for a child's phone speaker: trims the silence at both
# ends, shortens any pause longer than 0.6 s to 0.4 s (a child waiting through
# a second and a half of nothing thinks the line has finished), and fades the
# very start and end so there are no clicks.
SHAPE = (
    "highpass=f=70,"
    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05"
    ":stop_periods=-1:stop_duration=0.6:stop_threshold=-45dB:stop_silence=0.4,"
    "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,"
    "afade=t=in:d=0.04,areverse,afade=t=in:d=0.02,"
    # A gentle squeeze of the loud consonants ("t", "d", "p") so a short line can
    # reach the same loudness as a long one without clipping on its peaks.
    "acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=2"
)
# Every clip is set to the same loudness so Sunny is never suddenly quiet or
# loud from one question to the next, with headroom so nothing clips.
# Playback speed, 1.0 = as recorded. VOICE_SPEED=0.85 slows a clip about 15%
# without changing its pitch (used for the cloned voice, which came out fast).
SPEED = float(os.environ.get("VOICE_SPEED", "1.0"))
TARGET_LUFS = -16
TARGET_PEAK = -2.0


def _loudness(path: str) -> float | None:
    """Integrated loudness in LUFS, or None for a silent or unreadable file."""
    out = subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    found = re.findall(r"I:\s+(-?[\d.]+) LUFS", out)
    return float(found[-1]) if found else None


def polish(source: str, dest: Path) -> None:
    """Reads any audio file ffmpeg can, writes a shaped, loudness-matched mono mp3 to `dest`."""
    tmp = Path(str(dest) + ".tmp")
    shaped = Path(str(tmp) + ".wav")
    out = Path(str(tmp) + ".mp3")
    try:
        # 1. Shape into a lossless file, so the mp3 below is only encoded once.
        subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(source), "-af", SHAPE + (f",atempo={SPEED}" if SPEED != 1.0 else ""), "-ac", "1", "-ar", "24000", str(shaped)],
            check=True,
        )
        # 2. Set the gain that brings it to the target loudness, and catch any
        #    peak that gain pushes over with a limiter (a short word like "Tap the
        #    ram." has loud consonants that stop a plain gain from reaching it).
        measured = _loudness(str(shaped))
        gain = 0.0 if measured is None else max(-12.0, min(10.0, TARGET_LUFS - measured))
        limit = 10 ** (TARGET_PEAK / 20)
        subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(shaped), "-af",
             f"volume={gain:.2f}dB,alimiter=limit={limit:.3f}:attack=2:release=40:level=disabled",
             "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-b:a", "48k", str(out)],
            check=True,
        )
        out.replace(dest)
    finally:
        shaped.unlink(missing_ok=True)
        out.unlink(missing_ok=True)


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    source, text = sys.argv[1], normalize(sys.argv[2])
    key = line_key(text)
    VOICE.mkdir(parents=True, exist_ok=True)
    polish(source, VOICE / f"{key}.mp3")
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
