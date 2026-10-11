import confetti from "canvas-confetti";

/**
 * Sounds and confetti for the student game. Sounds are Kenney's CC0
 * "Interface Sounds" and "Music Jingles" packs (public/sounds/CREDITS.txt),
 * served from public/ and precached by the service worker so they work
 * offline. A child can mute them with the speaker button; the choice is
 * kept on the device.
 */
export type GameSound = "tap" | "star" | "mission" | "quest" | "oops";

const VOLUME: Record<GameSound, number> = { tap: 0.4, star: 0.5, mission: 0.55, quest: 0.6, oops: 0.5 };
const SOUND_KEY = "rw:sound";

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* private mode: the choice lasts until reload */
  }
}

// Web Audio rather than <audio>: the sounds are fetched like any other file,
// so the service worker can answer from its cache offline. Safari won't play
// an <audio> file from a service worker without byte-range responses.
let audioCtx: AudioContext | null = null;
const buffers = new Map<GameSound, Promise<AudioBuffer | null>>();

function context(): AudioContext | null {
  if (audioCtx) return audioCtx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audioCtx = new Ctor();
  return audioCtx;
}

function load(ctx: AudioContext, name: GameSound): Promise<AudioBuffer | null> {
  let buffer = buffers.get(name);
  if (!buffer) {
    buffer = fetch(`/sounds/${name}.mp3`)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null);
    buffers.set(name, buffer);
  }
  return buffer;
}

export function playSound(name: GameSound) {
  if (typeof window === "undefined" || !soundEnabled()) return;
  const ctx = context();
  if (!ctx) return;
  // Browsers keep audio suspended until the first tap; resuming before that just fails.
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  load(ctx, name).then((buffer) => {
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = VOLUME[name];
    source.connect(gain).connect(ctx.destination);
    source.start();
  });
}

const COLORS = ["#ea580c", "#f59e0b", "#facc15", "#0f766e", "#2563eb", "#db2777"];
let cannon: confetti.CreateTypes | null = null;

function getCannon() {
  if (cannon) return cannon;
  const canvas = document.createElement("canvas");
  canvas.className = "rw-confetti-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  // useWorker: false because the CSP (next.config.ts) allows no blob: workers.
  cannon = confetti.create(canvas, { resize: true, useWorker: false, disableForReducedMotion: true });
  return cannon;
}

/** A small star shower from `origin` (viewport fractions), or a big burst. */
export function burst(kind: "star" | "mission" | "quest", origin?: { x: number; y: number }) {
  if (typeof window === "undefined") return;
  const fire = getCannon();
  if (kind === "star") {
    fire({
      particleCount: 14,
      spread: 55,
      startVelocity: 22,
      gravity: 0.9,
      scalar: 0.9,
      ticks: 80,
      shapes: ["star"],
      colors: ["#facc15", "#f59e0b"],
      origin: origin ?? { x: 0.5, y: 0.3 },
    });
  } else if (kind === "mission") {
    fire({ particleCount: 90, spread: 80, startVelocity: 40, origin: { x: 0.5, y: 0.55 }, colors: COLORS });
  } else {
    const end = Date.now() + 1400;
    const frame = () => {
      fire({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors: COLORS });
      fire({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors: COLORS });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }
}

/** Where an element sits on screen, as the viewport fractions confetti wants. */
export function originOf(el: Element | null): { x: number; y: number } | undefined {
  if (!el || typeof window === "undefined") return undefined;
  const r = el.getBoundingClientRect();
  return { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };
}
