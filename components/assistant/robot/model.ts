import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import logo from '@/components/brand/logo-geometry.json';

/**
 * Sunny as a real 3D model, built in code from the shapes of the rendered character (robot.webp): a wide rounded head
 * with a black glass visor, lime eyes and mouth drawn on it, a silver egg-shaped body with the SUN MEDIA badge, dark ball
 * shoulders ringed in lime, short arms with mitten hands. A rigid robot, so the rig is a joint hierarchy (body → head,
 * body → arms) rather than a skinned mesh. Units: the whole robot is HEIGHT tall, centred on the origin.
 */

export const HEIGHT = 2.21;
const LIME = '#d4fc18';
/** Body width relative to the profile below: the egg is about 0.85 of the head's width, as in the picture. */
const W = 1.1;

export type RobotRig = {
  root: THREE.Group;
  spin: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  eyes: THREE.Group;
  mouth: { smile: THREE.Mesh; flat: THREE.Mesh; talk: THREE.Mesh };
  mats: { smile: THREE.MeshBasicMaterial; flat: THREE.MeshBasicMaterial; talk: THREE.MeshBasicMaterial; face: THREE.MeshBasicMaterial; accent: THREE.MeshStandardMaterial };
  halos: THREE.Sprite[];
  /** The physically based materials: they take the studio environment as their own envMap (so their intensity counts). */
  pbr: THREE.MeshPhysicalMaterial[];
  particles: THREE.Points;
  ring: THREE.Mesh;
  dispose: () => void;
};

/** A soft round dot, for the eye glow and the energy particles. */
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

/** The chest badge: the SUN MEDIA logo from its traced geometry, silver on a black plate, the lime "I". */
function badgeTexture(): THREE.CanvasTexture {
  const [vw, vh] = logo.viewBox;
  const pad = 26;
  const s = 2.2;
  const c = document.createElement('canvas');
  c.width = Math.round((vw + pad * 2) * s);
  c.height = Math.round((vh + pad * 2) * s);
  const g = c.getContext('2d')!;
  g.scale(s, s);
  const r = 22;
  const w = vw + pad * 2;
  const h = vh + pad * 2;
  g.beginPath();
  g.roundRect(0, 0, w, h, r);
  g.fillStyle = '#0a0a0c';
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(255,255,255,0.14)';
  g.stroke();
  g.translate(pad, pad);
  const silver = g.createLinearGradient(0, 0, 0, vh);
  silver.addColorStop(0, logo.colors.silverTop);
  silver.addColorStop(1, logo.colors.silverBottom);
  g.strokeStyle = silver;
  g.fillStyle = silver;
  g.lineWidth = logo.sunStroke;
  g.lineJoin = 'miter';
  g.lineCap = 'butt';
  for (const line of logo.sun) {
    g.beginPath();
    line.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
  for (const rings of logo.media) {
    g.beginPath();
    for (const ring of rings) ring.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.fill('evenodd');
  }
  const bar = logo.accentBar;
  g.fillStyle = logo.colors.lime;
  g.fillRect(bar.x, bar.y, bar.w, bar.h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A tube along a curve, for the eye and mouth strokes. */
const stroke = (curve: THREE.Curve<THREE.Vector3>, radius: number) => new THREE.TubeGeometry(curve, 24, radius, 8, false);
const v3 = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

export function buildRobot(): RobotRig {
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

  const silver = keep(new THREE.MeshPhysicalMaterial({ color: '#eef0f3', metalness: 0.92, roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.14, envMapIntensity: 1 }));
  const dark = keep(new THREE.MeshPhysicalMaterial({ color: '#0e0e11', metalness: 0.35, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.8 }));
  // Deep black glass: the studio is bright for the chrome, so the visor takes only a faint part of it.
  const glass = keep(new THREE.MeshPhysicalMaterial({ color: '#010102', metalness: 0, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 0.14 }));
  const accent = keep(new THREE.MeshStandardMaterial({ color: LIME, emissive: LIME, emissiveIntensity: 1.1, roughness: 0.35, metalness: 0, toneMapped: false }));
  const face = keep(new THREE.MeshBasicMaterial({ color: LIME, toneMapped: false }));
  const basic = (opacity: number) => keep(new THREE.MeshBasicMaterial({ color: LIME, toneMapped: false, transparent: true, opacity, depthWrite: false }));
  const mats = { smile: basic(1), flat: basic(0), talk: basic(0), face, accent };
  const dot = keep(glowTexture());
  const badgeMap = keep(badgeTexture());
  const badge = keep(new THREE.MeshPhysicalMaterial({ map: badgeMap, transparent: true, metalness: 0.2, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.5 }));

  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, at?: [number, number, number], rot?: [number, number, number]) => {
    keep(geometry);
    const m = new THREE.Mesh(geometry, material);
    if (at) m.position.set(...at);
    if (rot) m.rotation.set(...rot);
    return m;
  };

  const root = new THREE.Group();
  const spin = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.015;
  root.add(spin);
  spin.add(body);

  // Body: an egg, widest at the chest, flattened front to back.
  const profile = new THREE.SplineCurve(
    [
      [0.0, 0.02],
      [0.22, 0.015],
      [0.4, -0.02],
      [0.52, -0.1],
      [0.575, -0.25],
      [0.58, -0.4],
      [0.55, -0.6],
      [0.47, -0.82],
      [0.34, -0.98],
      [0.17, -1.09],
      [0.0, -1.12],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
  );
  const bodyGeo = new THREE.LatheGeometry(profile.getPoints(48), 64);
  bodyGeo.scale(W, 1, 0.84 * W);
  body.add(mesh(bodyGeo, silver));
  // Panel seam around the lower body, and the lime light on its side.
  const seam = mesh(new THREE.TorusGeometry(0.548 * W, 0.007, 8, 72), dark, [0, -0.6, 0], [Math.PI / 2, 0, 0]);
  seam.scale.set(1, 0.84, 1);
  body.add(seam);
  const pillAngle = -1.15;
  const pill = mesh(new THREE.CapsuleGeometry(0.028, 0.15, 6, 12), accent, [0.505 * W * Math.sin(pillAngle), -0.72, 0.505 * W * Math.cos(pillAngle) * 0.84], [0, pillAngle, 0.12]);
  body.add(pill);

  // Badge: a plane bent to the chest.
  const badgeW = 0.52;
  const badgeH = badgeW * (badgeMap.image.height / badgeMap.image.width);
  const badgeGeo = new THREE.PlaneGeometry(badgeW, badgeH, 20, 1);
  const pos = badgeGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, 0.84 * Math.sqrt((0.585 * W) ** 2 - x * x) + 0.004);
  }
  badgeGeo.computeVertexNormals();
  body.add(mesh(badgeGeo, badge, [0, -0.34, 0]));

  // Neck and head (the head pivots at the neck).
  body.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.14, 32), dark, [0, 0.06, 0]));
  const head = new THREE.Group();
  head.position.y = 0.1;
  body.add(head);
  head.add(mesh(new RoundedBoxGeometry(1.5, 0.98, 1.02, 6, 0.3), silver, [0, 0.5, 0]));
  head.add(mesh(new RoundedBoxGeometry(1.3, 0.76, 0.14, 5, 0.22), glass, [0, 0.5, 0.455]));
  for (const side of [-1, 1]) {
    head.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 32), dark, [side * 0.75, 0.48, 0], [0, 0, Math.PI / 2]));
    head.add(mesh(new THREE.TorusGeometry(0.152, 0.014, 8, 48), accent, [side * 0.772, 0.48, 0], [0, Math.PI / 2, 0]));
  }

  // Face, drawn on the visor: two arched eyes, and three mouths that cross-fade.
  const FACE_Z = 0.53;
  const eyes = new THREE.Group();
  eyes.position.set(0, 0.56, FACE_Z);
  head.add(eyes);
  const arch = new THREE.CubicBezierCurve3(v3(-0.12, -0.045), v3(-0.12, 0.075), v3(0.12, 0.075), v3(0.12, -0.045));
  const halos: THREE.Sprite[] = [];
  for (const x of [-0.27, 0.27]) {
    eyes.add(mesh(stroke(arch, 0.033), face, [x, 0, 0]));
    const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: dot, color: LIME, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })));
    halo.position.set(x, 0.01, -0.01);
    halo.scale.setScalar(0.55);
    eyes.add(halo);
    halos.push(halo);
  }
  const mouthAt: [number, number, number] = [0, 0.34, FACE_Z];
  const smileMesh = mesh(stroke(new THREE.QuadraticBezierCurve3(v3(-0.09, 0.025), v3(0, -0.07), v3(0.09, 0.025)), 0.022), mats.smile, mouthAt);
  const flatMesh = mesh(stroke(new THREE.LineCurve3(v3(-0.065, -0.01), v3(0.065, -0.01)), 0.02), mats.flat, mouthAt);
  const talkMesh = mesh(new THREE.CircleGeometry(0.085, 40), mats.talk, [0, 0.33, FACE_Z + 0.004]);
  head.add(smileMesh, flatMesh, talkMesh);

  // Arms: a dark ball shoulder ringed in lime, a silver upper arm, a lime elbow ring, a dark mitten hand with a thumb.
  const arm = (side: -1 | 1) => {
    const g = new THREE.Group();
    g.position.set(side * 0.58 * W, -0.2, 0);
    g.add(mesh(new THREE.SphereGeometry(0.12, 32, 16), dark));
    g.add(mesh(new THREE.TorusGeometry(0.118, 0.016, 8, 40), accent, [side * 0.035, 0, 0], [0, Math.PI / 2, 0]));
    g.add(mesh(new THREE.CapsuleGeometry(0.085, 0.24, 8, 16), silver, [side * 0.05, -0.25, 0], [0, 0, side * 0.15]));
    g.add(mesh(new THREE.TorusGeometry(0.083, 0.012, 8, 32), accent, [side * 0.085, -0.42, 0], [Math.PI / 2, 0, side * 0.15]));
    const hand = mesh(new THREE.SphereGeometry(0.11, 32, 16), dark, [side * 0.1, -0.56, 0.01]);
    hand.scale.set(0.95, 1.15, 0.78);
    g.add(hand);
    g.add(mesh(new THREE.CapsuleGeometry(0.03, 0.07, 6, 10), dark, [side * 0.03, -0.5, 0.075], [0.5, 0, side * -0.5]));
    return g;
  };
  const armL = arm(-1);
  const armR = arm(1);
  body.add(armL, armR);

  // Energy field (10): lime motes on a slow helix around the robot and a thin holographic ring at the waist.
  const COUNT = 64;
  const pts = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const a = i * 2.39996;
    const y = -1.0 + (2.1 * i) / COUNT;
    const rad = 0.85 + 0.12 * Math.sin(i * 1.7);
    pts.set([Math.cos(a) * rad, y, Math.sin(a) * rad * 0.8], i * 3);
  }
  const pGeo = keep(new THREE.BufferGeometry());
  pGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const particles = new THREE.Points(pGeo, keep(new THREE.PointsMaterial({ map: dot, color: LIME, size: 0.42, sizeAttenuation: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })));
  spin.add(particles);
  const ring = mesh(new THREE.TorusGeometry(0.86, 0.006, 6, 96), keep(new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })), [0, -0.38, 0], [Math.PI / 2 - 0.12, 0, 0]);
  ring.scale.set(1, 0.84, 1);
  spin.add(ring);

  // Every solid part casts the soft shadow onto the floor below (the face, glow and particles do not).
  body.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material !== face && !(o.material as THREE.Material).transparent) o.castShadow = true;
  });

  return {
    root,
    spin,
    body,
    head,
    armL,
    armR,
    eyes,
    mouth: { smile: smileMesh, flat: flatMesh, talk: talkMesh },
    mats,
    halos,
    pbr: [silver, dark, glass, badge],
    particles,
    ring,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
