import { getAudioContext } from "@/lib/gameFx";
import { recordedClip } from "@/lib/voiceClips";

/**
 * How Sunny speaks. A line with a recording (public/voice, voiceClips.ts)
 * plays that, in the Ghanaian-accented voice it was made with; any other
 * line (a question an admin wrote, or one that's been reworded) is spoken by
 * the device's own voice, which is picked to sound as close to West African
 * English as the device has. Recordings play through Web Audio, like the
 * game sounds, so the service worker can serve them offline.
 */

const buffers = new Map<string, Promise<AudioBuffer | null>>();
let playing: AudioBufferSourceNode | null = null;
/** Bumped whenever a new line starts or speech is stopped, so a slow clip never talks over a newer line. */
let turn = 0;

/** Whether Sunny can say anything at all on this device. */
export function canSpeak(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.speechSynthesis !== "undefined" || getAudioContext() !== null;
}

export function stopSpeaking() {
  turn += 1;
  if (playing) {
    try {
      playing.stop();
    } catch {
      /* already finished */
    }
    playing = null;
  }
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

/** West African English first, then the nearest others: the closest voice a device is likely to have. */
const PREFERRED_LANGS = ["en-gh", "en-ng", "en-ke", "en-za", "en-gb", "en-in"];

function deviceVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  for (const lang of PREFERRED_LANGS) {
    const match = voices.find((v) => v.lang.replace("_", "-").toLowerCase() === lang);
    if (match) return match;
  }
  return null;
}

function deviceSpeak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = deviceVoice();
  utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-US";
  utterance.rate = 0.86;
  window.speechSynthesis.speak(utterance);
}

function loadClip(ctx: AudioContext, path: string): Promise<AudioBuffer | null> {
  let buffer = buffers.get(path);
  if (!buffer) {
    buffer = fetch(path)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error("no clip"))))
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null);
    buffers.set(path, buffer);
  }
  return buffer;
}

/** Sunny says this line: its recording if it has one, otherwise the device's voice. */
export function sayAloud(text: string) {
  if (typeof window === "undefined") return;
  stopSpeaking();
  const mine = turn;
  const clip = recordedClip(text);
  const ctx = clip ? getAudioContext() : null;
  if (!clip || !ctx) {
    deviceSpeak(text);
    return;
  }
  // Browsers keep audio suspended until the first tap; resuming before that just fails.
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  loadClip(ctx, clip).then((buffer) => {
    if (turn !== mine) return;
    if (!buffer) {
      deviceSpeak(text);
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      if (playing === source) playing = null;
    };
    playing = source;
    source.start();
  });
}
