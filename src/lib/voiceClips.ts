import manifest from "./voiceManifest.json";
import { lineKey } from "./voiceKey";

/**
 * Sunny's recorded lines (public/voice/<key>.mp3), by the key of the exact
 * text each one says (voiceKey.ts). voiceManifest.json lists them with their
 * text; a line that isn't listed (reworded, or written by an admin) simply
 * has no clip and Sunny says it in the device's voice instead.
 */
export const VOICE_CLIPS: Readonly<Record<string, string>> = manifest.clips;

/** The path of the recording for this exact text, or null if there isn't one. */
export function recordedClip(text: string): string | null {
  const key = lineKey(text);
  return key in VOICE_CLIPS ? `/voice/${key}.mp3` : null;
}
