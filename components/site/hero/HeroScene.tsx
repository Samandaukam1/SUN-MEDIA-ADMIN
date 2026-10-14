'use client';

import { Environment, Float, Lightformer, PerformanceMonitor, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import geometry from '@/components/brand/logo-geometry.json';
import { BubbleController, type BubblePartner } from '@/lib/site/bubbles';
import { PartnerBubbles, type BubbleView } from './PartnerBubbles';

/*
 * The SUN MEDIA logo in 3D, built from the same traced geometry as the 2D logo: a glossy black slab,
 * chrome SUN strokes with bevelled edges, brushed-silver MEDIA and the glowing lime "I". Partner logos float
 * around it in glass bubbles (PartnerBubbles); a light strip sweeps across the chrome.
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

const BACKDROP_SIZE = 40;
const BACKDROP_Z = -6;

/**
 * The lime glow behind the logo, painted into an opaque backdrop in the background colour. Opaque, so the
 * glass bubbles (which refract only solid things) show the glow through them instead of a dark disc.
 */
function useBackdropTexture() {
  return useMemo(() => {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, size, size);
    // Same falloff as the earlier additive glow: lime added onto the background colour.
    const radius = size * 0.068;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, radius);
    g.addColorStop(0, 'rgba(212,252,24,0.55)');
    g.addColorStop(0.35, 'rgba(212,252,24,0.16)');
    g.addColorStop(1, 'rgba(212,252,24,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

function Backdrop({ logoScale }: { logoScale: (landscape: boolean, viewportWidth: number) => number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const texture = useBackdropTexture();
  const { viewport, size } = useThree();
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const landscape = size.width >= 900;
    const scroll = Math.min(1.5, window.scrollY / Math.max(1, window.innerHeight));
    // Follow the logo's place on screen, projected back to the backdrop's depth.
    const k = (8 - BACKDROP_Z) / 8;
    const x = (landscape ? viewport.width * 0.235 : 0) * k;
    const y = ((landscape ? 0.1 : viewport.height * 0.255) + scroll * 1.2) * k;
    m.position.set(x, y, BACKDROP_Z);
    m.scale.setScalar(BACKDROP_SIZE * (logoScale(landscape, viewport.width) / 0.515));
  });
  return (
    <mesh ref={mesh} position={[0, 0, BACKDROP_Z]} scale={BACKDROP_SIZE}>
      <planeGeometry />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

function logoScaleFor(landscape: boolean, viewportWidth: number) {
  return landscape ? Math.min(0.86, (viewportWidth * 0.33) / LOGO_WIDTH) : Math.min(0.85, (viewportWidth * 0.74) / LOGO_WIDTH);
}

type Quality = { sweep: boolean; low: boolean };

function Logo3D({ pointer, intro }: { pointer: React.RefObject<THREE.Vector2>; intro: React.RefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Group>(null);
  const { sun, media, accent, slab } = useLogoGeometries();
  const { viewport, size } = useThree();

  const landscape = size.width >= 900;
  const scale = logoScaleFor(landscape, viewport.width);
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

export default function HeroScene({ active, onReady, partners }: { active: boolean; onReady: () => void; partners: BubblePartner[] }) {
  const pointer = useRef(new THREE.Vector2());
  const intro = useRef(0);
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const [quality, setQuality] = useState<Quality>({ sweep: !coarse, low: false });
  const [dpr, setDpr] = useState(coarse ? 1.25 : 1.75);
  const [calm, setCalm] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [controller] = useState(() => new BubbleController({ capacity: 3, edgesForSlot: () => ['right'] }));
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const [views, setViews] = useState<BubbleView[]>([]);
  const bubblePartners = useMemo(() => partners.filter((p) => p.logoUrl), [partners]);

  // The headline sits above the canvas, so the pointer is read from the window.
  useEffect(() => {
    if (coarse) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [coarse]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setCalm(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return (
    <div className="absolute inset-0">
      <Canvas
        aria-hidden
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
            setQuality({ sweep: false, low: true });
          }}
        />
        <ambientLight intensity={0.25} />
        <directionalLight position={[3, 4, 5]} intensity={0.9} />
        <Studio sweep={quality.sweep} />
        <Backdrop logoScale={logoScaleFor} />
        <Float speed={1.1} rotationIntensity={0.12} floatIntensity={0.35}>
          <Logo3D pointer={pointer} intro={intro} />
        </Float>
        <PartnerBubbles controller={controller} partners={bubblePartners} calm={calm} low={quality.low} buttons={buttons} onViews={setViews} />
      </Canvas>

      {/* Each bubble is a real button: mouse, touch and keyboard (Tab + Enter) burst it. */}
      <div className="pointer-events-none absolute inset-0" role="group" aria-label="Hamkorlarimiz logotiplari">
        {views.map((v) => (
          <button
            key={v.key}
            ref={(el) => {
              if (el) buttons.current.set(v.key, el);
              else buttons.current.delete(v.key);
            }}
            type="button"
            aria-label={`${v.name} — pufakni yorish`}
            aria-disabled={!v.interactive}
            title={v.name}
            onClick={() => controller.pop(v.key)}
            className={`absolute top-0 left-0 size-0 cursor-pointer rounded-full bg-transparent outline-none focus-visible:shadow-[0_0_0_2px_#d4fc18,0_0_28px_rgb(212_252_24/0.45)] ${
              v.interactive ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
