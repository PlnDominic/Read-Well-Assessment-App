"use client";

import { useEffect } from "react";

/**
 * Sunny with moods, for the student game. Each mood is a still of the same
 * Sunny (public/sunny/, made from public/sunny.png with an image model, one
 * expression sheet cut into stills so his face and size match). Changing
 * the mood pops the new still in; each mood also has its own idle motion
 * (globals.css, .rw-sunny-*), all of it switched off for
 * prefers-reduced-motion.
 *
 * Plain <img>s rather than next/image for the same reason as SunnyAvatar:
 * the service worker precaches these files for offline use.
 */
export type SunnyMood = "read" | "wave" | "think" | "listen" | "cheer" | "thumbs" | "trophy";

export const SUNNY_MOOD_SRC: Record<SunnyMood, string> = {
  read: "/sunny.png",
  wave: "/sunny/sunny-wave.webp",
  think: "/sunny/sunny-think.webp",
  listen: "/sunny/sunny-listen.webp",
  cheer: "/sunny/sunny-cheer.webp",
  thumbs: "/sunny/sunny-thumbs.webp",
  trophy: "/sunny/sunny-trophy.webp",
};

export const SUNNY_FACE_SRC = "/sunny/sunny-face.webp";

let preloaded = false;

export function AnimatedSunny({
  mood,
  size = 120,
  say,
  peek = false,
  className = "",
}: {
  mood: SunnyMood;
  size?: number;
  /** A speech bubble beside Sunny; changing it pops the bubble again. */
  say?: string | null;
  /** Peeking over the top edge of the card below: his cut-off bottom stays hidden. */
  peek?: boolean;
  className?: string;
}) {
  // Every mood is loaded up front so a swap never flashes an empty frame.
  useEffect(() => {
    if (preloaded) return;
    preloaded = true;
    for (const src of [...Object.values(SUNNY_MOOD_SRC), SUNNY_FACE_SRC]) {
      const img = new Image();
      img.src = src;
    }
  }, []);

  return (
    <div
      className={`rw-sunny rw-sunny-${mood} ${peek ? "rw-sunny-peek" : ""} ${className}`}
      style={{ width: size, height: size }}
    >
      <div className="rw-sunny-clip">
        <div className="rw-sunny-motion">
          {/* key: a new mood remounts the image, which replays the pop-in. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={mood} src={SUNNY_MOOD_SRC[mood]} alt="" aria-hidden="true" className="rw-sunny-img" />
        </div>
      </div>
      {say && (
        <div key={say} className="rw-sunny-bubble" role="status">
          {say}
        </div>
      )}
    </div>
  );
}
