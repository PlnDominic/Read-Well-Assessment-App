"use client";

import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { PresentationControls, ContactShadows, useGLTF, useAnimations } from "@react-three/drei";
import type { Group } from "three";

/**
 * Only ever loaded via next/dynamic(..., { ssr: false }) from Sunny3D.tsx —
 * importing @react-three/fiber during server rendering is unsafe (it
 * touches browser globals), so this whole module must stay client-only.
 */

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

// Simple exponential ease toward a target, independent of frame rate.
function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

// Self-hosted (not fetched from a third-party CDN at runtime) so it stays
// offline-safe: see the sw.js fetch handler, which cache-first's anything
// under /models/ the same way it does /_next/static/ chunks.
const FOX_MODEL_URL = "/models/fox.glb";

/** Sunny is the Khronos glTF-Sample-Assets "Fox": a public-domain base mesh
 * by PixelMannen, rigged and animated by tomkranis (CC-BY 4.0), converted to
 * glTF by AsoboStudio and scurest (CC-BY 4.0) — see the credit in README.md.
 * Of its three animation clips (Survey, Walk, Run), only Survey holds still;
 * Walk and Run carry root motion that translates the whole rig many units
 * across the scene, which would make Sunny drift out of a small fixed
 * badge, so Survey is the only one played here. */
function SunnyModel({ mood }: { mood: "smile" | "big-smile" }) {
  const group = useRef<Group>(null);
  const squish = useRef<Group>(null);
  const pressed = useRef(false);
  const { scene, animations } = useGLTF(FOX_MODEL_URL);
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    const action = actions.Survey;
    if (!action) return;
    action.reset().fadeIn(0.4).play();
    // A livelier pace for the excited/encouraging screens, without a second
    // animation clip (Walk/Run would drift, see above). THREE.AnimationAction
    // is an imperative three.js handle, not React state — mutating it is how
    // it's meant to be used.
    // eslint-disable-next-line react-hooks/immutability
    action.timeScale = mood === "big-smile" ? 1.6 : 1;
    return () => {
      action.fadeOut(0.4);
    };
  }, [actions, mood]);

  useFrame((_, delta) => {
    const g = squish.current;
    if (!g) return;
    const targetY = pressed.current ? 0.85 : 1;
    const targetXZ = pressed.current ? 1.08 : 1;
    g.scale.y = damp(g.scale.y, targetY, 18, delta);
    g.scale.x = damp(g.scale.x, targetXZ, 18, delta);
    g.scale.z = damp(g.scale.z, targetXZ, 18, delta);
  });

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    pressed.current = true;
  };
  const release = () => {
    pressed.current = false;
  };

  return (
    <PresentationControls cursor snap speed={1.2} zoom={1} polar={[-Math.PI / 10, Math.PI / 8]} azimuth={[-Math.PI, Math.PI]}>
      <group ref={group} onPointerDown={onDown} onPointerUp={release} onPointerOut={release}>
        <group ref={squish}>
          <primitive object={scene} scale={0.02} position={[0, -0.79, 0]} rotation={[0, -1.2, 0]} />
        </group>
      </group>
    </PresentationControls>
  );
}

useGLTF.preload(FOX_MODEL_URL);

// Catches a failed model fetch (e.g. offline on a device that never loaded
// this page online before, so nothing's in the service worker's cache yet)
// and falls back to the flat SVG rather than surfacing the app's generic
// error screen for what's just a mascot.
class SunnyModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function SunnyCanvas({
  size = 56,
  mood = "smile",
  fallback,
}: {
  size?: number;
  mood?: "smile" | "big-smile";
  fallback: ReactNode;
}) {
  // null on first client render (matches SSR) so there's no flash before
  // capability is known; then true/false once checked.
  const [webglOk, setWebglOk] = useState<boolean | null>(null);

  useEffect(() => {
    // Reading a browser capability (WebGL support) on mount — not derivable
    // during render/SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebglOk(hasWebGL());
  }, []);

  if (!webglOk) return <>{fallback}</>;

  return (
    <SunnyModelBoundary fallback={fallback}>
      <div style={{ width: size, height: size }}>
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
          camera={{ position: [0, 0, 3.4], fov: 32 }}
          style={{ width: "100%", height: "100%" }}
        >
          <ambientLight intensity={1} />
          <directionalLight position={[2, 3, 4]} intensity={1} />
          <directionalLight position={[-2, -1, -2]} intensity={0.4} />
          <Suspense fallback={null}>
            <SunnyModel mood={mood} />
            <ContactShadows position={[0, -0.79, 0]} opacity={0.35} scale={3} blur={2.2} far={1.2} />
          </Suspense>
        </Canvas>
      </div>
    </SunnyModelBoundary>
  );
}
