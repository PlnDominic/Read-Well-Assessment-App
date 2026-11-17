# Cloning Sunny's voice for free

Only clone a voice you own or have the speaker's permission to clone.

1. Record `sample.wav`: 10-30 s of the speaker reading naturally, quiet room, no music.
2. Open `clone-voice.ipynb` in https://colab.research.google.com (File > Upload notebook), choose a T4 GPU, run the cells, upload `sample.wav` and `lines.json`, download `voice-out.zip`.
3. Unzip it, then from the repo root:
   `voice-clone/import-clips.sh path/to/out && npm test`
4. Listen to the clips before committing. The speaker's accent carries over from the sample.

`lines.json` is every spoken line: the 44 existing clips plus the 6 writing prompts not yet recorded.
Note: the first three Level 1 story questions are a real recording; remove those from `lines.json` to keep them.
