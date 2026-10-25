import * as THREE from 'three';

import { depthAt, FRAME, sculpt, type PartName, type Sculpted } from './sculpt';

/**
 * Sunny in 3D, reconstructed from the original picture (see sculpt.ts): the picture's own head, body and arms as real
 * volumes in the picture's pose, its pixels painted on their fronts. The face is not in that texture (the screen of
 * robot.webp is wiped, as for the 2D robot): the original eyes and smile, cut from the master render (face.webp), lie on
 * the visor as decals exactly where they are in the picture, so at rest they are the original pixels and they can still
 * blink, look and give way to the talking mouth. The 1254 px frame is FRAME_WORLD wide.
 */

/**
 * The master render at full resolution (1254 px, lossless), its screen wiped like robot.webp: the 3D robot is drawn from
 * it at full quality. The flat robot keeps the light robot.webp, so the page itself loads as fast as before.
 */
export const IMAGE_URL = '/assistant/robot-hd.webp';
/** The original eyes and smile, cut from the master render with their glow (lime light only, no glass). */
export const FACE_URL = '/assistant/face.webp';
export const FRAME_WORLD = 2.46;
const SCALE = FRAME_WORLD / FRAME;
/** Robot height (the picture's 56…1184 px), world units. */
export const HEIGHT = (1184 - 56) * SCALE;
/** The picture point at the world origin; the frame's centre sits this far below it (world units). */
export const CENTER: [number, number] = [FRAME / 2, (56 + 1184) / 2];
export const FRAME_OFFSET_Y = (FRAME / 2 - CENTER[1]) * SCALE;
const LIME = '#d4fc18';

export type RobotRig = {
  root: THREE.Group;
  spin: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** Moves both eyes (where they look); `lids` blink each eye about its own centre. */
  eyes: THREE.Group;
  lids: THREE.Group[];
  eyeRest: THREE.Vector3;
  mouth: { smile: THREE.Object3D; flat: THREE.Object3D; talk: THREE.Mesh };
  mats: { smile: THREE.MeshBasicMaterial; flat: THREE.MeshBasicMaterial; talk: THREE.MeshBasicMaterial; face: THREE.MeshBasicMaterial; accent: THREE.MeshStandardMaterial };
  halos: THREE.Sprite[];
  pbr: THREE.MeshStandardMaterial[];
  particles: THREE.Points;
  ring: THREE.Mesh;
  dispose: () => void;
};

/** The picture's alpha at `size`×`size`, for the silhouettes. */
export function readAlpha(image: HTMLImageElement | ImageBitmap, size = 640): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(image, 0, 0, size, size);
  const rgba = g.getImageData(0, 0, size, size).data;
  const a = new Uint8ClampedArray(size * size);
  for (let i = 0; i < a.length; i++) a[i] = rgba[i * 4 + 3];
  return a;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The surface: the picture where the picture shows it, a satin silver where it does not (sides, back, the bits hidden
 * behind other parts). On the front the picture keeps its own light (`refGain`) with a little of the live studio light
 * (`refLive`), so at rest it is the picture and still reacts as it turns; the blend fades out where the surface turns
 * away from the picture's camera (refW, baked per vertex) and at the picture's soft edge (its alpha).
 */
function paintedMaterial(map: THREE.Texture, color: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3, envMapIntensity: 0.6 });
  m.toneMapped = false;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.refMap = { value: map };
    shader.uniforms.refGain = { value: 1 };
    shader.uniforms.refLive = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 refUv;\nattribute float refW;\nvarying vec2 vRefUv;\nvarying float vRefW;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRefUv = refUv;\nvRefW = refW;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D refMap;\nuniform float refGain;\nuniform float refLive;\nvarying vec2 vRefUv;\nvarying float vRefW;')
      .replace(
        '#include <opaque_fragment>',
        'vec4 ref = texture2D(refMap, vRefUv);\nfloat refMix = vRefW * smoothstep(0.04, 0.5, ref.a);\noutgoingLight = mix(outgoingLight, ref.rgb * refGain + outgoingLight * refLive, refMix);\n#include <opaque_fragment>',
      );
  };
  m.customProgramCacheKey = () => 'sunny-painted';
  return m;
}

/** Where the face pieces are: in the master picture (`src`: x, y, w, h) and in face.webp (`atlas`: x, y). */
const ATLAS = { w: 528, h: 149 };
const FACE = {
  eyeL: { src: [455, 250, 204, 149], atlas: [0, 0], center: [561, 314] },
  eyeR: { src: [779, 316, 185, 141], atlas: [208, 0], center: [875, 377] },
  smile: { src: [645, 392, 131, 78], atlas: [397, 0], center: [709, 432] },
} as const;
/** The thinking mouth: a short level stroke where the smile is (the 2D robot's). */
const FLAT = [
  [686, 432],
  [732, 432],
];

/** How the picture becomes geometry (the site and the GLB export use the same settings). */
export const SCULPT = { scale: SCALE, center: CENTER, step: 4 } as const;

/**
 * The reconstruction, off the main thread when the browser allows it (it is the heavy part: ~150 ms), else here.
 * Resolves to the parts ready to become meshes.
 */
export function sculptPicture(image: HTMLImageElement | ImageBitmap): Promise<Sculpted[]> {
  const alpha = readAlpha(image, FRAME);
  const here = () => sculpt(alpha, FRAME, SCULPT);
  if (typeof Worker === 'undefined') return Promise.resolve(here());
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./sculpt.worker.ts', import.meta.url));
    } catch {
      return resolve(here());
    }
    const done = (parts: Sculpted[]) => {
      worker.terminate();
      resolve(parts);
    };
    worker.onmessage = (e: MessageEvent<Sculpted[]>) => done(e.data);
    worker.onerror = () => done(here());
    worker.postMessage({ alpha, size: FRAME, ...SCULPT }, [alpha.buffer]);
  });
}

export function buildRobot(image: HTMLImageElement | ImageBitmap, faceImage: HTMLImageElement | ImageBitmap, parts: Sculpted[]): RobotRig {
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

  const map = keep(new THREE.Texture(image));
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.needsUpdate = true;
  const part = (n: PartName) => parts.find((p) => p.name === n)!;

  // The sides and back take the picture's own silver (its mid tone is about rgb 150, highlights 200).
  const painted = keep(paintedMaterial(map, '#9a9ea4'));
  const accent = keep(new THREE.MeshStandardMaterial({ color: LIME, emissive: LIME, emissiveIntensity: 1, toneMapped: false }));
  const faceMap = keep(new THREE.Texture(faceImage));
  faceMap.colorSpace = THREE.SRGBColorSpace;
  faceMap.anisotropy = 8;
  faceMap.needsUpdate = true;
  // Light added onto the black glass: at rest the decal adds exactly the original lime light.
  const decal = (opacity: number) => keep(new THREE.MeshBasicMaterial({ map: faceMap, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const face = decal(1);
  const basic = (opacity: number) => keep(new THREE.MeshBasicMaterial({ color: LIME, toneMapped: false, transparent: true, opacity, depthWrite: false }));
  const mats = { smile: decal(1), flat: basic(0), talk: basic(0), face, accent };
  const dot = keep(glowTexture());

  const meshOf = (s: Sculpted) => {
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(s.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(s.normals, 3));
    g.setAttribute('refUv', new THREE.BufferAttribute(s.uvs, 2));
    g.setAttribute('refW', new THREE.BufferAttribute(s.front, 1));
    g.setIndex(new THREE.BufferAttribute(s.index, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, painted);
    m.castShadow = true;
    m.name = s.name;
    return m;
  };

  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  // The body is the trunk: the head and both arms hang on it at their joints, in the picture's pose.
  const bodyPart = part('body');
  const body = new THREE.Group();
  body.position.set(...bodyPart.pivot);
  body.add(meshOf(bodyPart));
  spin.add(body);
  const attach = (s: Sculpted) => {
    const j = new THREE.Group();
    j.position.set(s.pivot[0] - bodyPart.pivot[0], s.pivot[1] - bodyPart.pivot[1], s.pivot[2] - bodyPart.pivot[2]);
    j.add(meshOf(s));
    body.add(j);
    return j;
  };
  const headPart = part('head');
  const head = attach(headPart);
  const armL = attach(part('armL'));
  const armR = attach(part('armR'));

  // Face on the visor, head-local: picture px → world, lifted onto the head's front surface.
  const onHead = (u: number, v: number, lift = 0) =>
    new THREE.Vector3((u - CENTER[0]) * SCALE - headPart.pivot[0], (CENTER[1] - v) * SCALE - headPart.pivot[1], depthAt(headPart, u, v) + lift);
  const stroke = (pts: number[][], width: number, material: THREE.Material) => {
    const r = (width / 2) * SCALE;
    const curve = new THREE.CatmullRomCurve3(pts.map(([u, v]) => onHead(u, v, r * 0.5)));
    const g = new THREE.Group();
    g.add(new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 48, r, 10, false)), material));
    // Round ends, like the original strokes.
    for (const t of [0, 1]) {
      const cap = new THREE.Mesh(keep(new THREE.SphereGeometry(r, 12, 8)), material);
      cap.position.copy(curve.getPoint(t));
      g.add(cap);
    }
    return g;
  };
  /** Wraps `obj` (built in head coordinates) in a holder at `at`, so it scales about that point. */
  const about = (obj: THREE.Object3D, at: THREE.Vector3) => {
    const holder = new THREE.Group();
    holder.position.copy(at);
    obj.position.sub(at);
    holder.add(obj);
    return holder;
  };

  /** A face piece from the atlas, lying on the visor exactly over its place in the picture. */
  const piece = (f: (typeof FACE)[keyof typeof FACE], material: THREE.Material) => {
    const [x, y, w, h] = f.src;
    const [ax, ay] = f.atlas;
    const g = keep(new THREE.PlaneGeometry(w * SCALE, h * SCALE));
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (ax + uv.getX(i) * w) / ATLAS.w, 1 - (ay + (1 - uv.getY(i)) * h) / ATLAS.h);
    const m = new THREE.Mesh(g, material);
    m.position.copy(onHead(x + w / 2, y + h / 2, 0.004));
    m.renderOrder = 2;
    return m;
  };

  const eyeRest = onHead((FACE.eyeL.center[0] + FACE.eyeR.center[0]) / 2, (FACE.eyeL.center[1] + FACE.eyeR.center[1]) / 2);
  const eyes = new THREE.Group();
  eyes.position.copy(eyeRest);
  head.add(eyes);
  const lids: THREE.Group[] = [];
  for (const eye of [FACE.eyeL, FACE.eyeR]) {
    // Each eye blinks about the centre of its own stroke.
    const lid = about(piece(eye, face), onHead(eye.center[0], eye.center[1]));
    lid.position.sub(eyeRest);
    eyes.add(lid);
    lids.push(lid);
  }
  const halos: THREE.Sprite[] = [];

  const mouthAt = onHead(FACE.smile.center[0], FACE.smile.center[1], 0.004);
  const smile = about(piece(FACE.smile, mats.smile), mouthAt);
  const flat = stroke(FLAT, 14, mats.flat);
  const talk = new THREE.Mesh(keep(new THREE.CircleGeometry(30 * SCALE, 40)), mats.talk);
  talk.position.copy(mouthAt);
  // The visor leans with the head in the picture (about 9°), and so does the mouth.
  talk.rotation.z = -0.15;
  head.add(smile, flat, talk);

  // Energy field (10): lime motes on a slow helix around the robot and a thin holographic ring at the waist.
  const COUNT = 64;
  const pts = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const a = i * 2.39996;
    const y = -1.0 + (2.1 * i) / COUNT;
    const rad = 0.95 + 0.12 * Math.sin(i * 1.7);
    pts.set([Math.cos(a) * rad, y, Math.sin(a) * rad * 0.8], i * 3);
  }
  const pGeo = keep(new THREE.BufferGeometry());
  pGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const particles = new THREE.Points(pGeo, keep(new THREE.PointsMaterial({ map: dot, color: LIME, size: 8, sizeAttenuation: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })));
  spin.add(particles);
  const ring = new THREE.Mesh(
    keep(new THREE.TorusGeometry(0.62, 0.006, 6, 96)),
    keep(new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })),
  );
  ring.position.set(-0.05, (CENTER[1] - 860) * SCALE, 0);
  ring.rotation.set(Math.PI / 2 - 0.12, 0, 0);
  spin.add(ring);

  return {
    root,
    spin,
    body,
    head,
    armL,
    armR,
    eyes,
    lids,
    eyeRest,
    mouth: { smile, flat, talk },
    mats,
    halos,
    pbr: [painted],
    particles,
    ring,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
