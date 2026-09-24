"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { colors } from "@/lib/theme";

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

/** Sunny's shape built from primitive geometry (spheres, a cone, a half
 * torus for the mouth) rather than an imported model file — see the header
 * comment in Sunny3D.tsx for why. Proportions are eyeballed against the
 * flat SVG version in icons.tsx, not derived from its coordinates. */
function SunnyModel({ mood }: { mood: "smile" | "big-smile" }) {
  const group = useRef<Group>(null);
  const big = mood === "big-smile";

  // A gentle idle sway/bob so the character reads as "alive" without being
  // distracting on a login/waiting screen.
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.getElapsedTime();
    g.rotation.y = Math.sin(t * 0.6) * 0.35;
    g.position.y = Math.sin(t * 1.6) * 0.04;
  });

  return (
    <group ref={group}>
      <mesh position={[-0.78, -0.14, -0.08]} scale={[0.4, 0.62, 0.48]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color={colors.sageMid} roughness={0.55} />
      </mesh>
      <mesh position={[0.78, -0.14, -0.08]} scale={[0.4, 0.62, 0.48]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color={colors.sageMid} roughness={0.55} />
      </mesh>

      <mesh scale={[1, 1, 0.78]}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshStandardMaterial color={colors.cream} roughness={0.75} emissive={colors.cream} emissiveIntensity={0.18} />
      </mesh>

      <mesh position={[-0.36, 0.12, 0.62]}>
        <sphereGeometry args={[0.24, 24, 24]} />
        <meshStandardMaterial color={colors.sageDeep} roughness={0.3} />
      </mesh>
      <mesh position={[0.36, 0.12, 0.62]}>
        <sphereGeometry args={[0.24, 24, 24]} />
        <meshStandardMaterial color={colors.sageDeep} roughness={0.3} />
      </mesh>
      <mesh position={[-0.29, 0.19, 0.82]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} />
      </mesh>
      <mesh position={[0.43, 0.19, 0.82]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} />
      </mesh>

      <mesh position={[0, -0.12, 0.78]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.16, 0.22, 4]} />
        <meshStandardMaterial color={colors.terracotta} roughness={0.5} />
      </mesh>

      {/* Mouth: bottom half of a torus, so it reads as a "u" smile curve. */}
      <mesh position={[0, big ? -0.42 : -0.36, 0.66]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[big ? 0.26 : 0.2, 0.045, 12, 24, Math.PI]} />
        <meshStandardMaterial color={colors.sageDeep} roughness={0.5} />
      </mesh>
    </group>
  );
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
    <div style={{ width: size, height: size }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [0, 0, 3.4], fov: 32 }}
        style={{ width: "100%", height: "100%" }}
      >
        <ambientLight intensity={0.95} />
        <directionalLight position={[2, 3, 4]} intensity={0.7} />
        <directionalLight position={[-2, -1, -2]} intensity={0.45} />
        <SunnyModel mood={mood} />
      </Canvas>
    </div>
  );
}
