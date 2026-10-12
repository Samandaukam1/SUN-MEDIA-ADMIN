'use client';

import { Environment, Float, Lightformer, MeshTransmissionMaterial, PerformanceMonitor, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import geometry from '@/components/brand/logo-geometry.json';

/*
 * The SUN MEDIA logo in 3D, built from the same traced geometry as the 2D logo: a glossy black slab,
 * chrome SUN strokes with bevelled edges, brushed-silver MEDIA and the glowing lime "I". Liquid-glass
 * drops float around it and refract it; a light strip sweeps across the chrome.
 */

const UNIT = 0.01;
const [VIEW_W, VIEW_H] = geometry.viewBox;
const LOGO_WIDTH = VIEW_W * UNIT;
const BG = '#060607';
const LIME = '#d4fc18';

const toWorld = (x: number, y: number) => new THREE.Vector2((x - VIEW_W / 2) * UNIT, -(y - VIEW_H / 2) * UNIT);

const BEVEL = { bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.012, bevelSegments: 4, curveSegments: 1 } as const;

/** Outline of an orthogonal polyline stroked with square (mitred) joins and butt ends. */
function strokeOutline(points: number[][], half: number): THREE.Shape {
  const dirs = points.slice(1).map((p, i) => new THREE.Vector2(p[0] - points[i][0], p[1] - points[i][1]).normalize());
  const normal = (d: THREE.Vector2) => new THREE.Vector2(-d.y, d.x);
  const side = (sign: 1 | -1) =>
    points.map((p, i) => {
      const prev = dirs[i - 1];
      const next = dirs[i];
      // Ends: the segment's normal. A 90° turn: the mitre corner sits at the sum of both normals.
      const offset = new THREE.Vector2();
      if (prev) offset.add(normal(prev));
      if (next) offset.add(normal(next));
      return new THREE.Vector2(p[0], p[1]).add(offset.multiplyScalar(half * sign));
    });
  const outline = [...side(1), ...side(-1).reverse()].map((v) => toWorld(v.x, v.y));
  return new THREE.Shape(outline);
}

function useLogoGeometries() {
  return useMemo(() => {
    const half = geometry.sunStroke / 2 - BEVEL.bevelSize / UNIT;
    const sun = geometry.sun.map(
      (line) => new THREE.ExtrudeGeometry(strokeOutline(line, half), { ...BEVEL, depth: 0.07 }),
    );
    const media = geometry.media.map((rings) => {
      const [outer, ...holes] = rings.map((ring) => ring.map(([x, y]) => toWorld(x, y)));
      const shape = new THREE.Shape(outer);
      holes.forEach((hole) => shape.holes.push(new THREE.Path(hole)));
      return new THREE.ExtrudeGeometry(shape, { ...BEVEL, depth: 0.16 });
    });
    const bar = geometry.accentBar;
    const barShape = new THREE.Shape([
      toWorld(bar.x, bar.y),
      toWorld(bar.x + bar.w, bar.y),
      toWorld(bar.x + bar.w, bar.y + bar.h),
      toWorld(bar.x, bar.y + bar.h),
    ]);
    const accent = new THREE.ExtrudeGeometry(barShape, { ...BEVEL, depth: 0.16 });
    const box = geometry.box;
    const slabCenter = toWorld(box.x + box.w / 2, box.y + box.h / 2);
    return { sun, media, accent, slab: { width: box.w * UNIT, height: box.h * UNIT, center: slabCenter } };
  }, []);
}

/** Soft radial glow behind the logo (also refracted by the glass). */
function useGlowTexture() {
  return useMemo(() => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(212,252,24,0.55)');
    g.addColorStop(0.35, 'rgba(212,252,24,0.16)');
    g.addColorStop(1, 'rgba(212,252,24,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

type Quality = { samples: number; resolution: number; sweep: boolean };

function Logo3D({ pointer, intro }: { pointer: React.RefObject<THREE.Vector2>; intro: React.RefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Group>(null);
  const { sun, media, accent, slab } = useLogoGeometries();
  const glow = useGlowTexture();
  const { viewport, size } = useThree();

  const landscape = size.width >= 900;
  const scale = landscape ? Math.min(0.86, (viewport.width * 0.33) / LOGO_WIDTH) : Math.min(0.85, (viewport.width * 0.74) / LOGO_WIDTH);
  const anchorX = landscape ? viewport.width * 0.235 : 0;
  const anchorY = landscape ? 0.1 : viewport.height * 0.255;

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = Math.min(1, (intro.current ?? 0) + delta / 1.8);
    intro.current = t;
    const ease = 1 - Math.pow(1 - t, 4);
    const scroll = Math.min(1.5, window.scrollY / Math.max(1, window.innerHeight));
    const p = pointer.current ?? new THREE.Vector2();

    const targetRotY = (landscape ? -0.32 : -0.12) + p.x * 0.38 + (1 - ease) * -1.1 + scroll * 0.5;
    const targetRotX = 0.08 - p.y * 0.22 + scroll * 0.25;
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, targetRotY, 3.2, delta);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, targetRotX, 3.2, delta);
    g.position.x = THREE.MathUtils.damp(g.position.x, anchorX + p.x * 0.12, 3, delta);
    g.position.y = THREE.MathUtils.damp(g.position.y, anchorY + scroll * 1.2 + (1 - ease) * -0.6, 3, delta);
    g.scale.setScalar(scale * (0.72 + ease * 0.28));

    if (halo.current) {
      halo.current.rotation.z += delta * 0.08;
      halo.current.rotation.x = 1.15 + Math.sin(state.clock.elapsedTime * 0.3) * 0.08;
    }
  });

  return (
    <group ref={group}>
      <mesh position={[0, 0, -1.6]} scale={7}>
        <planeGeometry />
        <meshBasicMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>

      <group ref={halo} rotation={[1.15, 0.2, 0]}>
        <mesh>
          <torusGeometry args={[2.75, 0.009, 16, 220]} />
          <meshBasicMaterial color={LIME} toneMapped={false} />
        </mesh>
        <mesh rotation={[0.35, 0.5, 0]}>
          <torusGeometry args={[3.05, 0.006, 16, 220]} />
          <meshStandardMaterial color="#e4e4e7" metalness={1} roughness={0.2} />
        </mesh>
      </group>

      <RoundedBox args={[slab.width, slab.height, 0.3]} radius={0.045} smoothness={6} position={[slab.center.x, slab.center.y, 0]}>
        <meshPhysicalMaterial color="#0c0c0e" metalness={0.45} roughness={0.28} clearcoat={1} clearcoatRoughness={0.05} envMapIntensity={1.2} />
      </RoundedBox>

      {sun.map((geo, i) => (
        <mesh key={i} geometry={geo} position={[0, 0, 0.15 + BEVEL.bevelThickness]}>
          <meshStandardMaterial color="#f4f4f5" metalness={1} roughness={0.16} envMapIntensity={1.8} />
        </mesh>
      ))}

      {media.map((geo, i) => (
        <mesh key={i} geometry={geo} position={[0, 0, -0.08]}>
          <meshStandardMaterial color="#d9d9de" metalness={1} roughness={0.3} envMapIntensity={1.3} />
        </mesh>
      ))}

      <mesh geometry={accent} position={[0, 0, -0.08]}>
        <meshStandardMaterial color={LIME} emissive={LIME} emissiveIntensity={0.55} roughness={0.35} metalness={0.1} toneMapped={false} />
      </mesh>
      <pointLight position={[1.1, -0.7, 0.6]} color={LIME} intensity={2.4} distance={2.4} decay={2} />
    </group>
  );
}

function GlassDrops({ quality }: { quality: Quality }) {
  const { viewport, size } = useThree();
  const landscape = size.width >= 900;
  const bg = useMemo(() => new THREE.Color(BG), []);
  const material = (thickness: number) => (
    <MeshTransmissionMaterial
      samples={quality.samples}
      resolution={quality.resolution}
      thickness={thickness}
      roughness={0}
      transmission={1}
      ior={1.25}
      chromaticAberration={0.12}
      anisotropy={0.15}
      distortion={0.25}
      distortionScale={0.4}
      temporalDistortion={0.08}
      clearcoat={1}
      clearcoatRoughness={0}
      envMapIntensity={2.2}
      attenuationDistance={2.5}
      attenuationColor="#f4f4f5"
      backside
      backsideThickness={0.2}
      color="#ffffff"
      background={bg}
    />
  );
  const cx = landscape ? viewport.width * 0.235 : 0;
  const cy = landscape ? 0.1 : viewport.height * 0.255;
  const k = landscape ? 0.85 : 0.6;
  return (
    <>
      <Float speed={1.3} rotationIntensity={0.4} floatIntensity={1}>
        <mesh position={[cx + 1.2 * k, cy - 1.25 * k, 1.4]}>
          <sphereGeometry args={[0.42 * k, 64, 64]} />
          {material(0.9)}
        </mesh>
      </Float>
      <Float speed={1.7} rotationIntensity={1.1} floatIntensity={1.3}>
        <mesh position={[cx + 1.55 * k, cy + 1.2 * k, 0.9]} rotation={[0.2, 0.3, -0.9]}>
          <capsuleGeometry args={[0.16 * k, 0.7 * k, 16, 48]} />
          {material(0.45)}
        </mesh>
      </Float>
      <Float speed={2.2} rotationIntensity={0.6} floatIntensity={1.6}>
        <mesh position={[cx - 1.35 * k, cy - 1.15 * k, 1.6]}>
          <sphereGeometry args={[0.17 * k, 48, 48]} />
          {material(0.3)}
        </mesh>
      </Float>
    </>
  );
}

/** Studio lighting from light panels only (no HDR download); on capable devices a strip sweeps across. */
function Studio({ sweep }: { sweep: boolean }) {
  const strip = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!strip.current) return;
    const t = state.clock.elapsedTime;
    strip.current.position.x = Math.sin(t * 0.45) * 7;
  });
  return (
    <Environment resolution={256} frames={sweep ? Infinity : 1}>
      <Lightformer intensity={2.4} rotation-x={Math.PI / 2} position={[0, 5, -6]} scale={[12, 1.2, 1]} />
      <Lightformer intensity={1.6} rotation-x={Math.PI / 2} position={[0, 4, -2]} scale={[12, 0.6, 1]} />
      <Lightformer intensity={1.4} rotation-y={Math.PI / 2} position={[-6, 1, -1]} scale={[20, 0.8, 1]} />
      <Lightformer intensity={1.2} rotation-y={-Math.PI / 2} position={[7, 0, 1]} scale={[20, 1.2, 1]} />
      <Lightformer form="ring" color={LIME} intensity={3.5} scale={2.4} position={[5, -2, 4]} target={[0, 0, 0]} />
      {/* A soft panel behind the camera keeps the chrome faces silver; the narrow strip sweeps a highlight across. */}
      <Lightformer intensity={0.75} position={[0, 0.5, 9]} scale={[14, 7, 1]} />
      <Lightformer ref={strip} intensity={5} position={[0, 0, 7]} scale={[0.8, 10, 1]} />
    </Environment>
  );
}

export default function HeroScene({ active, onReady }: { active: boolean; onReady: () => void }) {
  const pointer = useRef(new THREE.Vector2());
  const intro = useRef(0);
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const [quality, setQuality] = useState<Quality>(
    coarse ? { samples: 3, resolution: 256, sweep: false } : { samples: 6, resolution: 512, sweep: true },
  );
  const [dpr, setDpr] = useState(coarse ? 1.25 : 1.75);

  // The headline sits above the canvas, so the pointer is read from the window.
  useEffect(() => {
    if (coarse) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [coarse]);

  return (
    <Canvas
      dpr={dpr}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [0, 0, 8], fov: 32 }}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.05;
        requestAnimationFrame(onReady);
      }}
      style={{ touchAction: 'pan-y' }}
    >
      <color attach="background" args={[BG]} />
      <PerformanceMonitor
        onDecline={() => {
          setDpr(1);
          setQuality({ samples: 2, resolution: 192, sweep: false });
        }}
      />
      <ambientLight intensity={0.25} />
      <directionalLight position={[3, 4, 5]} intensity={0.9} />
      <Studio sweep={quality.sweep} />
      <Float speed={1.1} rotationIntensity={0.12} floatIntensity={0.35}>
        <Logo3D pointer={pointer} intro={intro} />
      </Float>
      <GlassDrops quality={quality} />
    </Canvas>
  );
}
