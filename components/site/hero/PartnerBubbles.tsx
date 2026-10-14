'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';

import type { Bubble, BubbleController, BubblePartner, Edge } from '@/lib/site/bubbles';
import { loadLogoLabel } from './logoLabel';

/*
 * Partner logos in soap-bubble glass around the 3D logo. Positions are laid out in screen space (so bubbles
 * never cover the headline, the menu or the buttons) and turned into world space at each bubble's depth.
 * BubbleController decides who is where; this file only draws it and moves the invisible buttons that make
 * each bubble clickable and keyboard-reachable.
 */

export type BubbleView = { key: number; name: string; interactive: boolean };

type Slot = { fx: number; fy: number; z: number; scale: number };
export type BubbleLayout = {
  capacity: number;
  slots: Slot[];
  /** On-screen diameter (px) of a bubble with scale 1. */
  diameter: number;
  edges: (slot: number) => Edge[];
  /** Lowest y (px) a bubble may reach — above the headline on phones. */
  floor: number;
  ceiling: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;

/**
 * Wide screens: three places around the logo, right of the headline column and below the menu; they enter and
 * leave on the right. Phones and narrow tablets: three places beside the logo above the headline, entering from
 * the nearest side.
 */
export function bubbleLayout(width: number, height: number, viewportHeight: number): BubbleLayout {
  if (width >= 900) {
    // Mirrors the hero text column: max-w-6xl container, 32 px padding, 640 px text.
    const textRight = (Math.max(0, (width - 1152) / 2) + 32 + 640) / width;
    const left = Math.min(0.66, textRight + 0.035);
    const right = 0.968;
    const top = Math.max(0.16, 118 / height);
    const bottom = 0.88;
    const at = (u: number, v: number) => ({ fx: left + (right - left) * u, fy: top + (bottom - top) * v });
    // Exactly three at a time, spread around the logo; a popped one is replaced by the next partner.
    return {
      capacity: 3,
      diameter: clamp(width * 0.08, 90, 140),
      slots: [
        { ...at(0.12, 0.06), z: 0.9, scale: 1 },
        { ...at(0.9, 0.2), z: 0.6, scale: 1.08 },
        { ...at(0.42, 0.95), z: 1.1, scale: 1.02 },
      ],
      edges: () => ['right'],
      ceiling: top * height,
      floor: bottom * height + 40,
    };
  }
  // Phones: the logo sits centred above the headline (see Logo3D); bubbles go under its corners and beside its top.
  const textTop = Math.min(height, viewportHeight) * 0.43;
  const diameter = clamp(width * 0.18, 62, 96);
  const ceiling = 92 + diameter / 2;
  const floor = Math.max(ceiling + 40, textTop - 18 - diameter / 2);
  const logoW = width * 0.74;
  const logoH = logoW * 0.438;
  const logoTop = height * 0.245 - logoH / 2;
  const logoBottom = height * 0.245 + logoH / 2;
  const logoLeft = (width - logoW) / 2;
  const logoRight = (width + logoW) / 2;
  const at = (x: number, y: number) => ({ fx: x / width, fy: clamp(y, ceiling, floor) / height });
  const side = logoLeft;
  if (side >= diameter * 0.85) {
    // Portrait tablets: there is room beside the logo, so the bubbles keep clear of its letters.
    const d = Math.min(diameter, side * 0.92);
    const cy = height * 0.245;
    return {
      capacity: 3,
      diameter: d,
      slots: [
        { fx: side / 2 / width, fy: (cy + logoH * 0.22) / height, z: 1, scale: 0.94 },
        { fx: (width - side / 2) / width, fy: (cy - logoH * 0.3) / height, z: 0.7, scale: 0.92 },
        { fx: (width - side / 2) / width, fy: (cy + logoH * 0.36) / height, z: 1.2, scale: 1 },
      ],
      edges: (slot) => (slot === 0 ? ['left'] : ['right']),
      ceiling,
      floor,
    };
  }
  return {
    capacity: 3,
    diameter,
    slots: [
      { ...at(logoLeft + logoW * 0.14, logoBottom + diameter * 0.58), z: 1, scale: 0.94 },
      { ...at(logoRight + diameter * 0.05, logoTop - diameter * 0.5), z: 0.7, scale: 0.92 },
      { ...at(logoRight - logoW * 0.2, logoBottom + diameter * 0.58), z: 1.2, scale: 1 },
    ],
    edges: (slot) => (slot === 0 ? ['left'] : ['right']),
    ceiling,
    floor,
  };
}

/** Screen point (px) at depth z → world point, plus world units per pixel at that depth. */
function toWorld(px: number, py: number, z: number, width: number, height: number, camera: THREE.PerspectiveCamera) {
  const d = camera.position.z - z;
  const halfH = d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const halfW = halfH * (width / height);
  return { x: ((px / width) * 2 - 1) * halfW, y: (1 - (py / height) * 2) * halfH, unit: halfH / (height / 2) };
}

/** Where an arriving bubble starts / a leaving one ends: just outside the chosen edge. */
function edgePoint(edge: Edge, px: number, py: number, d: number, width: number, layout: BubbleLayout, seed: number) {
  const y = clamp(py + (seed - 0.5) * 120, layout.ceiling, layout.floor);
  if (edge === 'left') return { x: -d - 48, y };
  if (edge === 'top') return { x: px + (seed - 0.5) * 80, y: -d - 48 };
  return { x: width + d + 48, y };
}

type Shared = {
  shell: THREE.SphereGeometry;
  cap: THREE.SphereGeometry;
  ring: THREE.RingGeometry;
  drop: THREE.SphereGeometry;
  shine: THREE.PlaneGeometry;
  glass: THREE.MeshPhysicalMaterial;
  rim: THREE.ShaderMaterial;
  shineMat: THREE.MeshBasicMaterial;
};

const DROPS = 12;
/**
 * The label is a gently curved shell piece (radius 1.5× the bubble) set near the back of the bubble and turned
 * towards the viewer: it reads as stuck to the curved inside, yet bends the logo only slightly.
 */
const LABEL_CURVE = 1.5;
const LABEL_ANGLE = 1.0;
const LABEL_DEPTH = 0.55;

function useShared(low: boolean): Shared {
  const shared = useMemo(() => {
    const shineCanvas = document.createElement('canvas');
    shineCanvas.width = 128;
    shineCanvas.height = 128;
    const ctx = shineCanvas.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const shineTexture = new THREE.CanvasTexture(shineCanvas);
    return {
      shell: new THREE.SphereGeometry(1, 64, 48),
      cap: new THREE.SphereGeometry(1, 48, 32, Math.PI * 1.5 - LABEL_ANGLE / 2, LABEL_ANGLE, Math.PI / 2 - LABEL_ANGLE / 2, LABEL_ANGLE),
      ring: new THREE.RingGeometry(0.975, 1, 96),
      drop: new THREE.SphereGeometry(1, 10, 8),
      shine: new THREE.PlaneGeometry(1, 1),
      glass: new THREE.MeshPhysicalMaterial(),
      rim: new THREE.ShaderMaterial({
        uniforms: { uStrength: { value: 0.95 } },
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uStrength;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float f = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 3.0);
            vec3 tint = mix(vec3(1.0), vec3(0.83, 0.99, 0.09), 0.14);
            gl_FragColor = vec4(tint * f * uStrength, f * uStrength);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      shineMat: new THREE.MeshBasicMaterial({ map: shineTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.55 }),
    };
  }, []);

  // A thin soap film over clear glass; on weak devices a cheaper see-through shell without the refraction pass.
  useEffect(() => {
    const m = shared.glass;
    m.color.set('#ffffff');
    m.metalness = 0;
    m.roughness = 0.03;
    m.ior = 1.12;
    m.thickness = 0.08;
    m.iridescence = 0.9;
    m.iridescenceIOR = 1.33;
    m.iridescenceThicknessRange = [160, 520];
    m.clearcoat = 0.2;
    m.clearcoatRoughness = 0.05;
    m.specularIntensity = 0.55;
    m.envMapIntensity = 0.4;
    m.depthWrite = false;
    m.transmission = low ? 0 : 1;
    m.transparent = low;
    m.opacity = low ? 0.2 : 1;
    m.needsUpdate = true;
  }, [shared, low]);

  useEffect(
    () => () => {
      shared.shell.dispose();
      shared.cap.dispose();
      shared.ring.dispose();
      shared.drop.dispose();
      shared.shine.dispose();
      shared.glass.dispose();
      shared.rim.dispose();
      shared.shineMat.map?.dispose();
      shared.shineMat.dispose();
    },
    [shared],
  );
  return shared;
}

/** Unit directions for the burst droplets (mostly in the screen plane, a little depth). */
const DROP_DIRECTIONS = Array.from({ length: DROPS }, (_, i) => {
  const a = (i / DROPS) * Math.PI * 2 + (i % 2) * 0.21;
  return new THREE.Vector3(Math.cos(a), Math.sin(a), (i % 3) * 0.18 - 0.18).normalize();
});

function BubbleMesh({
  bubble,
  controller,
  layout,
  shared,
  texture,
  calm,
  buttons,
}: {
  bubble: Bubble;
  controller: BubbleController;
  layout: BubbleLayout;
  shared: Shared;
  texture: THREE.Texture | null;
  calm: boolean;
  buttons: RefObject<Map<number, HTMLButtonElement>>;
}) {
  const { size, camera } = useThree();
  const outer = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const shell = useRef<THREE.Mesh>(null);
  const logo = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const shine = useRef<THREE.Mesh>(null);
  const drops = useRef<THREE.InstancedMesh>(null);
  const reveal = useRef(0);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const point = useMemo(() => new THREE.Vector3(), []);
  const scaleVec = useMemo(() => new THREE.Vector3(), []);
  const identity = useMemo(() => new THREE.Quaternion(), []);
  const eye = useMemo(() => new THREE.Vector3(), []);

  const materials = useMemo(
    () => ({
      logo: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, alphaTest: 0.4, toneMapped: false }),
      ring: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }),
      drop: new THREE.MeshBasicMaterial({ color: '#f4f4f5', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    }),
    [],
  );
  useEffect(() => {
    materials.logo.alphaToCoverage = true;
    materials.logo.map = texture;
    materials.logo.needsUpdate = true;
  }, [materials, texture]);
  useEffect(
    () => () => {
      materials.logo.dispose();
      materials.ring.dispose();
      materials.drop.dispose();
    },
    [materials],
  );

  // Every bubble drifts on its own slow rhythm (6–14 s periods), never in step with the others.
  const motion = useMemo(() => {
    const r = (k: number) => {
      const x = Math.sin((bubble.key * 12.9898 + k * 78.233) * 43758.5453);
      return x - Math.floor(x);
    };
    const f = (k: number) => (Math.PI * 2) / (6 + r(k) * 8);
    return { ax: 9 + r(1) * 8, ay: 8 + r(2) * 7, w1: f(3), w2: f(4), w3: f(5), p1: r(6) * 6.28, p2: r(7) * 6.28, p3: r(8) * 6.28 };
  }, [bubble.key]);

  useFrame((_, delta) => {
    const o = outer.current;
    if (!o || !body.current || !shell.current || !logo.current || !ring.current || !drops.current || !shine.current) return;
    const width = size.width;
    const height = size.height;
    const slot = layout.slots[bubble.slot] ?? layout.slots[layout.slots.length - 1];
    const t = controller.now;
    const p = controller.progress(bubble);
    const d = layout.diameter * slot.scale;

    let px = slot.fx * width;
    let py = slot.fy * height;
    const scroll = Math.min(1.5, window.scrollY / Math.max(1, window.innerHeight));
    py -= scroll * 0.24 * height;
    if (!calm) {
      px += Math.sin(t * motion.w1 + motion.p1) * motion.ax + Math.sin(t * motion.w3 + motion.p3) * 4;
      py += Math.cos(t * motion.w2 + motion.p2) * motion.ay;
    }

    let size01 = 1;
    if (bubble.phase === 'entering') {
      if (bubble.edge === 'here') size01 = easeOut(p);
      else {
        const e = easeOut(p);
        const from = edgePoint(bubble.edge, px, py, d, width, layout, bubble.seed);
        px = from.x + (px - from.x) * e;
        py = from.y + (py - from.y) * e + Math.sin(e * Math.PI) * (bubble.seed - 0.5) * 46;
        size01 = 0.88 + 0.12 * e;
      }
    } else if (bubble.phase === 'exiting') {
      if (bubble.edge === 'here') size01 = 1 - easeOut(p);
      else {
        const e = easeIn(p);
        const to = edgePoint(bubble.edge, px, py, d, width, layout, 1 - bubble.seed);
        px += (to.x - px) * e;
        py += (to.y - py) * e;
      }
    }

    const w = toWorld(px, py, slot.z, width, height, camera as THREE.PerspectiveCamera);
    const r = (d / 2) * w.unit;
    o.position.set(w.x, w.y, slot.z);
    // Face the viewer (so the logo sits in the middle of the bubble wherever it floats), then sway a little.
    o.updateMatrixWorld();
    body.current.lookAt(eye.copy(camera.position));
    if (!calm) {
      body.current.rotateX(Math.sin(t * 0.17 + motion.p2) * 0.08);
      body.current.rotateY(Math.sin(t * 0.21 + motion.p1) * 0.14);
      body.current.rotateZ(Math.sin(t * 0.13 + motion.p3) * 0.05);
    }

    // Burst (≈0.38 s): a short stretch, the film vanishes, a thin ring widens and fine droplets fly off.
    let film = r * size01;
    let sx = 1;
    let sy = 1;
    let filmVisible = size01 > 0.002;
    let logoScale = 1;
    let ringOpacity = 0;
    let ringScale = 1;
    let dropT = -1;
    if (bubble.phase === 'popping') {
      if (calm) {
        film *= 1 - p;
        logoScale = 1 - p;
      } else {
        if (p < 0.3) {
          const s = p / 0.3;
          film *= 1 + 0.1 * s;
          sx = 1 + 0.07 * s;
          sy = 1 - 0.06 * s;
          logoScale = 1 + 0.05 * s;
        } else {
          filmVisible = false;
          logoScale = Math.max(0, 1 - (p - 0.3) / 0.28);
        }
        if (p >= 0.24) {
          const q = (p - 0.24) / 0.76;
          ringOpacity = 0.5 * Math.pow(1 - q, 1.6);
          ringScale = 1.02 + 0.62 * easeOut(q);
          dropT = q;
        }
      }
    }

    shell.current.visible = filmVisible;
    shell.current.scale.set(film * sx, film * sy, film);
    shine.current.visible = filmVisible;
    shine.current.position.set(-0.36 * film, 0.42 * film, film * 0.96);
    shine.current.scale.setScalar(film * 0.42);

    if (texture) reveal.current = Math.min(1, reveal.current + delta / 0.45);
    const labelScale = r * LABEL_CURVE * size01 * logoScale * easeOut(reveal.current);
    logo.current.visible = !!texture && labelScale > r * 0.01;
    logo.current.scale.setScalar(Math.max(labelScale, 1e-4));
    // Sphere centre in front, so the label's middle sits LABEL_DEPTH·r behind the bubble's centre.
    logo.current.position.z = labelScale - LABEL_DEPTH * r * size01 * logoScale;

    ring.current.visible = ringOpacity > 0.01;
    ring.current.scale.setScalar(r * ringScale);
    materials.ring.opacity = ringOpacity;

    if (dropT >= 0) {
      drops.current.visible = true;
      for (let i = 0; i < DROPS; i++) {
        point.copy(DROP_DIRECTIONS[i]).multiplyScalar(r * (1 + 0.85 * easeOut(dropT) * (0.7 + (i % 4) * 0.12)));
        scaleVec.setScalar(r * 0.04 * (1 - dropT) * (0.6 + (i % 3) * 0.25));
        matrix.compose(point, identity, scaleVec);
        drops.current.setMatrixAt(i, matrix);
      }
      drops.current.instanceMatrix.needsUpdate = true;
      materials.drop.opacity = 0.75 * (1 - dropT);
    } else {
      drops.current.visible = false;
    }

    // The invisible button over the bubble follows it on screen.
    const button = buttons.current?.get(bubble.key);
    if (button) {
      const dd = d * Math.max(size01, 0.01);
      button.style.transform = `translate3d(${(px - dd / 2).toFixed(1)}px, ${(py - dd / 2).toFixed(1)}px, 0)`;
      button.style.width = `${dd.toFixed(1)}px`;
      button.style.height = `${dd.toFixed(1)}px`;
    }
  });

  return (
    <group ref={outer}>
      <group ref={body}>
        <mesh ref={logo} geometry={shared.cap} material={materials.logo} renderOrder={1} />
        <mesh ref={shell} geometry={shared.shell} material={shared.glass} renderOrder={2}>
          <mesh geometry={shared.shell} material={shared.rim} scale={1.003} renderOrder={3} />
        </mesh>
      </group>
      <mesh ref={shine} geometry={shared.shine} material={shared.shineMat} renderOrder={4} />
      <mesh ref={ring} geometry={shared.ring} material={materials.ring} visible={false} renderOrder={4} />
      <instancedMesh ref={drops} args={[shared.drop, materials.drop, DROPS]} visible={false} renderOrder={4} />
    </group>
  );
}

export function PartnerBubbles({
  controller,
  partners,
  calm,
  low,
  buttons,
  onViews,
}: {
  controller: BubbleController;
  partners: BubblePartner[];
  calm: boolean;
  low: boolean;
  buttons: RefObject<Map<number, HTMLButtonElement>>;
  onViews: (views: BubbleView[]) => void;
}) {
  const { size, gl } = useThree();
  const shared = useShared(low);
  const layout = useMemo(() => bubbleLayout(size.width, size.height, window.innerHeight), [size.width, size.height]);
  const [mounted, setMounted] = useState<Bubble[]>([]);
  const seenVersion = useRef(-1);
  const textures = useRef(new Map<string, THREE.Texture | 'loading'>());
  const alive = useRef(true);
  const [, setLoaded] = useState(0);

  useEffect(() => controller.setReducedMotion(calm), [controller, calm]);
  useEffect(() => controller.setCapacity(layout.capacity, layout.edges), [controller, layout]);
  useEffect(() => controller.setPartners(partners), [controller, partners]);

  // Logo labels: loaded once per image, dropped when no active partner uses that image any more.
  useEffect(() => {
    const anisotropy = gl.capabilities.getMaxAnisotropy();
    for (const p of partners) {
      if (textures.current.has(p.logoUrl)) continue;
      textures.current.set(p.logoUrl, 'loading');
      void loadLogoLabel(p.logoUrl, p.name).then((texture) => {
        if (!alive.current) {
          texture.dispose();
          return;
        }
        texture.anisotropy = Math.min(8, anisotropy);
        textures.current.set(p.logoUrl, texture);
        setLoaded((n) => n + 1);
      });
    }
    const used = new Set(partners.map((p) => p.logoUrl));
    for (const [url, texture] of textures.current) {
      if (used.has(url) || texture === 'loading' || controller.bubbles.some((b) => b.partner.logoUrl === url)) continue;
      texture.dispose();
      textures.current.delete(url);
    }
  }, [partners, gl, controller]);

  useEffect(() => {
    alive.current = true;
    const map = textures.current;
    return () => {
      alive.current = false;
      for (const texture of map.values()) if (texture !== 'loading') texture.dispose();
      map.clear();
    };
  }, []);

  // One clock for every bubble: the controller advances only while this canvas renders.
  useFrame((_, delta) => {
    controller.tick(delta);
    if (controller.version !== seenVersion.current) {
      seenVersion.current = controller.version;
      const list = [...controller.bubbles];
      setMounted(list);
      onViews(list.map((b) => ({ key: b.key, name: b.partner.name, interactive: controller.isInteractive(b) })));
    }
  });

  return (
    <>
      {mounted.map((b) => {
        const texture = textures.current.get(b.partner.logoUrl);
        return (
          <BubbleMesh
            key={b.key}
            bubble={b}
            controller={controller}
            layout={layout}
            shared={shared}
            texture={texture && texture !== 'loading' ? texture : null}
            calm={calm}
            buttons={buttons}
          />
        );
      })}
    </>
  );
}
