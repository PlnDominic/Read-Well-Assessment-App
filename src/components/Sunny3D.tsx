"use client";

import dynamic from "next/dynamic";
import { SunnyMascot } from "@/components/icons";

// SunnyCanvas imports @react-three/fiber, which touches browser globals at
// module load time — ssr: false keeps that import itself off the server,
// not just the render. The flat SVG (same one used elsewhere in the app)
// is the fallback while the chunk loads and on devices without WebGL.
const SunnyCanvas = dynamic(() => import("@/components/SunnyCanvas"), { ssr: false });

/** Drop-in 3D replacement for SunnyMascot — same size/mood API. */
export function Sunny3D({ size = 56, mood = "smile" }: { size?: number; mood?: "smile" | "big-smile" }) {
  return <SunnyCanvas size={size} mood={mood} fallback={<SunnyMascot size={size} mood={mood} />} />;
}
