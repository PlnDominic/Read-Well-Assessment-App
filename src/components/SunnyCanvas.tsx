"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { PresentationControls, ContactShadows } from "@react-three/drei";
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

// Simple exponential ease toward a target, independent of frame rate.
function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/** Sunny's shape built from primitive geometry (spheres, a cone, a half
 * torus for the mouth) rather than an imported model file — see the header
 * comment in Sunny3D.tsx for why. Proportions are eyeballed against the
 * flat SVG version in icons.tsx, not derived from its coordinates.
 *
 * Wrapped in PresentationControls so it can be dragged around (it springs
 * back to the front-facing brand pose on release); nested inside is a
 * separate group carrying the idle sway so the two motions add together
 * instead of one overwriting the other. A third, innermost group handles
 * the "poke" squish, eased every frame toward pressed/released targets. */
function SunnyModel({ mood }: { mood: "smile" | "big-smile" }) {
  const sway = useRef<Group>(null);
  const squish = useRef<Group>(null);
  const pressed = useRef(false);
  const big = mood === "big-smile";

  useFrame((state, delta) => {
    const s = sway.current;
    if (s) {
      const t = state.clock.getElapsedTime();
      s.rotation.y = Math.sin(t * 0.6) * 0.35;
      s.position.y = Math.sin(t * 1.6) * 0.04;
    }
    const g = squish.current;
    if (g) {
      const targetY = pressed.current ? 0.8 : 1;
      const targetXZ = pressed.current ? 1.1 : 1;
      g.scale.y = damp(g.scale.y, targetY, 18, delta);
      g.scale.x = damp(g.scale.x, targetXZ, 18, delta);
      g.scale.z = damp(g.scale.z, targetXZ, 18, delta);
    }
  });

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    pressed.current = true;
  };
  const release = () => {
    pressed.current = false;
  };

  return (
    <PresentationControls
      cursor
      snap
      speed={1.2}
      zoom={1}
      polar={[-Math.PI / 4, Math.PI / 4]}
      azimuth={[-Math.PI, Math.PI]}
    >
      <group ref={sway}>
        <group ref={squish} onPointerDown={onDown} onPointerUp={release} onPointerOut={release}>
          <mesh position={[-0.78, -0.14, -0.08]} scale={[0.4, 0.62, 0.48]}>
            <sphereGeometry args={[1, 32, 32]} />
            <meshPhysicalMaterial color={colors.sageMid} roughness={0.45} clearcoat={0.5} clearcoatRoughness={0.3} />
          </mesh>
          <mesh position={[0.78, -0.14, -0.08]} scale={[0.4, 0.62, 0.48]}>
            <sphereGeometry args={[1, 32, 32]} />
            <meshPhysicalMaterial color={colors.sageMid} roughness={0.45} clearcoat={0.5} clearcoatRoughness={0.3} />
          </mesh>

          <mesh scale={[1, 1, 0.78]}>
            <sphereGeometry args={[1, 48, 48]} />
            <meshPhysicalMaterial
              color={colors.cream}
              roughness={0.55}
              clearcoat={0.6}
              clearcoatRoughness={0.25}
              emissive={colors.cream}
              emissiveIntensity={0.12}
            />
          </mesh>

          <mesh position={[-0.36, 0.12, 0.62]}>
            <sphereGeometry args={[0.24, 24, 24]} />
            <meshPhysicalMaterial color={colors.sageDeep} roughness={0.2} clearcoat={0.8} clearcoatRoughness={0.15} />
          </mesh>
          <mesh position={[0.36, 0.12, 0.62]}>
            <sphereGeometry args={[0.24, 24, 24]} />
            <meshPhysicalMaterial color={colors.sageDeep} roughness={0.2} clearcoat={0.8} clearcoatRoughness={0.15} />
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
            <meshPhysicalMaterial color={colors.terracotta} roughness={0.35} clearcoat={0.6} clearcoatRoughness={0.2} />
          </mesh>

          {/* Mouth: bottom half of a torus, so it reads as a "u" smile curve. */}
          <mesh position={[0, big ? -0.42 : -0.36, 0.66]} rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[big ? 0.26 : 0.2, 0.045, 12, 24, Math.PI]} />
            <meshPhysicalMaterial color={colors.sageDeep} roughness={0.4} clearcoat={0.5} clearcoatRoughness={0.25} />
          </mesh>
        </group>
      </group>
    </PresentationControls>
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
        <ambientLight intensity={0.85} />
        <directionalLight position={[2, 3, 4]} intensity={0.9} />
        <directionalLight position={[-2, -1, -2]} intensity={0.4} />
        <directionalLight position={[0, 1.5, -2.5]} intensity={0.3} color="#ffffff" />
        <SunnyModel mood={mood} />
        <ContactShadows position={[0, -0.62, 0]} opacity={0.35} scale={3} blur={2.2} far={1.2} />
      </Canvas>
    </div>
  );
}
