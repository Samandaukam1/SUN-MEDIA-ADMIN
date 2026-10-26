'use client';

import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';

import { QITMIR_LIGHT, QITMIR_RED, QITMIR_REST, qitmirTurns, smirked, squinted } from '../qitmir/face';
import type { SoundSubscribe } from '../voice';
import { buildRobot, FACE_URL, FRAME_OFFSET_Y, FRAME_WORLD, HEIGHT, IMAGE_URL, sculptPicture } from './model';
import type { Sculpted } from './sculpt';
import { MotionDirector, type MotionCue, type MotionMood } from './motion';

const LIME = '#d4fc18';
/** Eyes and smile under the warning light: the lime turns amber (a failed action, an error). */
const ALARM = new THREE.Color(1, 0.5, 0.42);
const LIME_LIGHT = new THREE.Color(LIME);
const tint = new THREE.Color();

/** The picture, the face atlas and the sculpted parts, loaded once per page: a second robot (the chat header) reuses them. */
let picture: Promise<{ body: HTMLImageElement; face: HTMLImageElement; parts: Sculpted[] }> | null = null;
export function loadPicture() {
  const load = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  picture ??= Promise.all([load(IMAGE_URL), load(FACE_URL)]).then(async ([body, face]) => ({ body, face, parts: await sculptPicture(body) }));
  // A failed load is tried again by the next robot, not remembered.
  picture.catch(() => (picture = null));
  return picture;
}

export type RobotCue = { name: MotionCue; id: number };
type Props = {
  mood: MotionMood;
  sound?: SoundSubscribe;
  cue?: RobotCue;
  /** Size of the robot's square on the page, px: the picture's frame, exactly where the flat robot is drawn. */
  box: number;
  /** Room around the square (left and above), px, so it can fly and turn without clipping. */
  room: number;
  calm: boolean;
  compact: boolean;
  /** No flight while the chat panel is open next to it. */
  roam: boolean;
  active: boolean;
  /** Qitmir mode: red eyes and a sly look, eased in and out (the robot itself is unchanged). */
  qitmir?: boolean;
  onReady: () => void;
  onFail: () => void;
};

/** WebGL errors (lost context, shader failure) hand the launcher back to the 2D robot instead of breaking the page. */
export class Boundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);
const euler = new THREE.Euler();
const quat = new THREE.Quaternion();
function slerpTo(obj: THREE.Object3D, [x, y, z]: [number, number, number], t: number) {
  quat.setFromEuler(euler.set(x, y, z));
  obj.quaternion.slerp(quat, t);
}

function Robot({ image, face, parts, mood, sound, cue, box, room, calm, compact, roam, qitmir = false, shadows, onBuilt }: Omit<Props, 'active' | 'onReady' | 'onFail'> & { image: HTMLImageElement; face: HTMLImageElement; parts: Sculpted[]; shadows: boolean; onBuilt: () => void }) {
  const rig = useMemo(() => buildRobot(image, face, parts), [image, face, parts]);
  const { viewport, clock, gl, scene } = useThree();
  const envSet = useRef(false);
  const director = useMemo(() => new MotionDirector({ calm, compact, now: 0 }), [calm, compact]);
  const audio = useRef({ level: 0, shape: 0.5 });
  const pointer = useRef({ x: 0, y: 0, near: false });
  const light = useRef<THREE.PointLight>(null);
  const alarm = useRef(0);
  const brightness = useRef(0.875 + 0.25 * 0.5);
  const red = useRef(qitmir ? 1 : 0);

  useEffect(() => () => rig.dispose(), [rig]);
  useEffect(() => {
    onBuilt();
  }, [rig, onBuilt]);
  useEffect(() => director.setRoam(roam, clock.elapsedTime), [director, roam, clock]);
  useEffect(() => director.setMood(mood, clock.elapsedTime), [director, mood, clock]);
  useEffect(() => {
    if (cue) director.cue(cue.name, clock.elapsedTime);
  }, [director, cue, clock]);

  // Real loudness and spectrum while Sunny speaks or listens; silence otherwise.
  useEffect(() => {
    if (!sound || (mood !== 'speaking' && mood !== 'listening')) {
      audio.current = { level: 0, shape: 0.5 };
      return;
    }
    return sound((f) => {
      audio.current.level = f.level;
      audio.current.shape = f.shape;
    });
  }, [sound, mood]);

  // 07: the pointer relative to the robot's resting place on screen (desktop only).
  useEffect(() => {
    if (compact) return;
    const onMove = (e: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      const dx = e.clientX - (r.right - box / 2);
      const dy = e.clientY - (r.bottom - box / 2);
      pointer.current = { x: Math.max(-1, Math.min(1, dx / 340)), y: Math.max(-1, Math.min(1, -dy / 300)), near: Math.hypot(dx, dy) < 420 };
    };
    const onLeave = () => (pointer.current.near = false);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [compact, gl, box]);

  // Orthographic, 1 unit = 1 CSS px: the picture's frame is exactly the robot's square at the canvas' bottom right.
  const scale = box / FRAME_WORLD;
  const reach = HEIGHT * scale;
  const rest = useMemo(() => new THREE.Vector3(viewport.width / 2 - box / 2, -viewport.height / 2 + box / 2 + FRAME_OFFSET_Y * scale, 0), [viewport.width, viewport.height, box, scale]);
  const target = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    rig.root.position.copy(rest);
    rig.root.scale.setScalar(scale);
  }, [rig, rest, scale]);

  useFrame((_, rawDt) => {
    // three.js applies envMapIntensity only to a material's own envMap: hand it the studio once it exists.
    if (!envSet.current && scene.environment) {
      for (const m of rig.pbr) {
        m.envMap = scene.environment;
        m.needsUpdate = true;
      }
      envSet.current = true;
    }
    const dt = Math.min(rawDt, 0.05);
    const t = clock.elapsedTime;
    const p = pointer.current;
    director.setPointer(p.x, p.y, p.near, t);
    const pose = director.update(t, audio.current.level, audio.current.shape);
    // Position with a little inertia; the flight never leaves the canvas (room on the left and above only).
    const maxLeft = (room / box) * 0.9;
    target.set(rest.x + Math.max(-maxLeft, pose.pos[0]) * reach, rest.y + Math.min(maxLeft, pose.pos[1]) * reach, pose.pos[2] * reach);
    rig.root.position.lerp(target, damp(6, dt));
    rig.root.scale.setScalar(THREE.MathUtils.lerp(rig.root.scale.x, scale * pose.scale, damp(10, dt)));
    rig.spin.rotation.y = pose.spin;
    slerpTo(rig.body, pose.body, damp(6, dt));
    slerpTo(rig.head, pose.head, damp(9, dt));
    slerpTo(rig.armL, pose.armL, damp(9, dt));
    slerpTo(rig.armR, pose.armR, damp(9, dt));

    // Face: each eye blinks about its own centre, both look together; mouths cross-fade; the talking mouth follows the
    // audio with the 2D robot's proportions (30 px wide, 5–27 px tall on the picture).
    red.current = THREE.MathUtils.lerp(red.current, qitmir ? 1 : 0, damp(4, dt));
    const q = red.current < 0.002 ? 0 : red.current;
    const squint = QITMIR_REST.squint * q;
    const smirk = QITMIR_REST.smirk * q;
    if (q || rig.lids[0].rotation.z) qitmirTurns(rig, squint, smirk);
    rig.lids.forEach((lid, i) => (lid.scale.y = THREE.MathUtils.lerp(lid.scale.y, squinted(pose.eyeOpen, squint, smirk, i), damp(pose.eyeOpen < 0.5 ? 40 : 14, dt))));
    rig.eyes.position.x = THREE.MathUtils.lerp(rig.eyes.position.x, rig.eyeRest.x + pose.look[0] * 0.035, damp(12, dt));
    rig.eyes.position.y = THREE.MathUtils.lerp(rig.eyes.position.y, rig.eyeRest.y + pose.look[1] * 0.025, damp(12, dt));
    const { smile, flat, talk } = rig.mats;
    smile.opacity = THREE.MathUtils.lerp(smile.opacity, pose.talk || pose.flat ? 0 : 1, damp(14, dt));
    flat.opacity = THREE.MathUtils.lerp(flat.opacity, pose.flat && !pose.talk ? 1 : 0, damp(14, dt));
    talk.opacity = THREE.MathUtils.lerp(talk.opacity, pose.talk, damp(14, dt));
    rig.mouth.smile.scale.y = THREE.MathUtils.lerp(rig.mouth.smile.scale.y, smirked(pose.smile, smirk), damp(10, dt));
    // sqrt: mid-loud syllables already open the mouth clearly; silence closes it to a slit.
    const loud = Math.sqrt(Math.min(1, pose.mouthOpen));
    rig.mouth.talk.scale.set(
      THREE.MathUtils.lerp(rig.mouth.talk.scale.x, 0.8 + pose.mouthWide * 0.3 - loud * 0.2, damp(25, dt)),
      THREE.MathUtils.lerp(rig.mouth.talk.scale.y, 0.17 + loud * 0.75, damp(25, dt)),
      1,
    );

    // Light: eye halos, lime accents and the glow from the ring below follow `glow`; the energy field follows `energy`.
    // The original face light at rest (glow 0.25), brighter as Sunny listens, speaks or lights up.
    brightness.current = THREE.MathUtils.lerp(brightness.current, 0.875 + pose.glow * 0.5, damp(10, dt));
    alarm.current = THREE.MathUtils.lerp(alarm.current, pose.alarm, damp(10, dt));
    tint.setScalar(1).lerp(ALARM, alarm.current);
    if (q) tint.lerp(QITMIR_RED, q * (1 - alarm.current));
    tint.multiplyScalar(brightness.current);
    rig.mats.face.color.copy(tint);
    rig.mats.smile.color.copy(tint);
    if (light.current) {
      light.current.intensity = THREE.MathUtils.lerp(light.current.intensity, 0.6 + pose.glow * 1.8, damp(8, dt));
      light.current.color.copy(LIME_LIGHT).lerp(QITMIR_LIGHT, q);
    }
    const pm = rig.particles.material as THREE.PointsMaterial;
    pm.opacity = THREE.MathUtils.lerp(pm.opacity, pose.energy * 0.9, damp(6, dt));
    rig.particles.visible = pm.opacity > 0.01;
    if (rig.particles.visible) {
      rig.particles.rotation.y += dt * (0.6 + pose.energy * 1.6);
      rig.particles.position.y = Math.sin(t * 1.3) * 0.05;
    }
    const rm = rig.ring.material as THREE.MeshBasicMaterial;
    rm.opacity = THREE.MathUtils.lerp(rm.opacity, pose.energy * 0.75, damp(6, dt));
    rig.ring.visible = rm.opacity > 0.01;
    if (rig.ring.visible) rig.ring.scale.setScalar(1 + 0.06 * Math.sin(t * 4) * pose.energy);
  });

  // Soft shadow on the floor where the neon ring is: the key light from above draws the robot's real silhouette, blurred
  // (variance shadow map); the floor leans toward the camera like the ring's ellipse so the shadow lies on it.
  const floor = rest.y - box * 0.47;
  const shadowLight = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = shadowLight.current;
    if (!l) return;
    l.target.position.set(rest.x, floor, 0);
    l.target.updateMatrixWorld();
    const cam = l.shadow.camera;
    const half = reach * 1.2;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 1;
    cam.far = reach * 6;
    cam.updateProjectionMatrix();
  }, [rest, floor, reach, shadows]);

  return (
    <>
      <primitive object={rig.root} />
      <pointLight ref={light} position={[rest.x, rest.y - reach * 0.75, reach * 0.35]} color={LIME} intensity={0.6} distance={reach * 1.6} decay={0} />
      {shadows ? (
        <>
          <directionalLight
            ref={shadowLight}
            position={[rest.x - reach * 0.4, floor + reach * 3, reach * 0.9]}
            intensity={0.35}
            castShadow
            shadow-mapSize={[512, 512]}
            shadow-radius={9}
            shadow-blurSamples={16}
            shadow-bias={-0.0005}
          />
          <mesh position={[rest.x, floor, -reach * 0.2]} rotation={[-Math.PI / 2 + 0.2, 0, 0]} receiveShadow>
            <planeGeometry args={[reach * 2.4, reach * 2.4]} />
            <shadowMaterial transparent opacity={0.4} />
          </mesh>
        </>
      ) : null}
    </>
  );
}

/** The lights and the soft studio reflected on the sides and the back (the front shows the picture's own light). */
export function Studio() {
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[-3, 4, 5]} intensity={1} />
      <directionalLight position={[4, 2.5, -4]} intensity={1.2} color="#e8f0ff" />
      <Environment resolution={128} frames={1}>
        <color attach="background" args={['#4a4c52']} />
        <Lightformer intensity={3} rotation-x={Math.PI / 2} position={[0, 6, 0]} scale={[14, 8, 1]} />
        <Lightformer intensity={1.8} position={[0, 0.5, 8]} scale={[14, 8, 1]} />
        <Lightformer intensity={1.6} rotation-y={Math.PI / 2} position={[-7, 1, 0]} scale={[18, 2, 1]} />
        <Lightformer intensity={1.4} rotation-y={-Math.PI / 2} position={[7, 0, 1]} scale={[18, 2.4, 1]} />
        <Lightformer form="ring" color={LIME} intensity={2} scale={2} position={[3, -3, 3]} target={[0, 0, 0]} />
      </Environment>
    </>
  );
}

/**
 * Sunny in real 3D (three.js via React Three Fiber, already used by the site's hero), reconstructed from the original
 * picture. Transparent canvas over the launcher; an orthographic camera so the front view at rest is the picture;
 * renders only while visible, at a pixel ratio that drops on weak GPUs. No post-processing.
 */
export default function Robot3D({ active, onReady, onFail, ...props }: Props) {
  const coarse = props.compact;
  // Sharp on every screen (up to 3× pixel ratio); only a GPU that cannot keep up drops to 1.5×.
  const [dpr, setDpr] = useState(() => Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 3));
  const [images, setImages] = useState<{ body: HTMLImageElement; face: HTMLImageElement; parts: Sculpted[] } | null>(null);
  // The parent's callbacks may change on every render: the picture is loaded once and the robot built once regardless.
  const handlers = useRef({ onReady, onFail });
  handlers.current = { onReady, onFail };
  const fail = useCallback(() => handlers.current.onFail(), []);
  useEffect(() => {
    let live = true;
    loadPicture()
      .then((p) => live && setImages(p))
      .catch(() => live && fail());
    return () => {
      live = false;
    };
  }, [fail]);
  const announced = useRef(false);
  const built = useCallback(() => {
    if (announced.current) return;
    announced.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => handlers.current.onReady()));
  }, []);
  if (!images) return null;
  return (
    <Boundary onFail={fail}>
      <Canvas
        aria-hidden
        dpr={dpr}
        orthographic
        frameloop={active ? 'always' : 'never'}
        camera={{ position: [0, 0, 2000], zoom: 1, near: 1, far: 6000 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'default', premultipliedAlpha: true }}
        shadows={coarse ? false : 'variance'}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.toneMapping = THREE.NoToneMapping;
          gl.domElement.addEventListener('webglcontextlost', fail, { once: true });
        }}
        style={{ pointerEvents: 'none' }}
      >
        <PerformanceMonitor onDecline={() => setDpr((d) => Math.min(d, 1.5))} />
        <Studio />
        <Robot {...props} image={images.body} face={images.face} parts={images.parts} shadows={!coarse} onBuilt={built} />
      </Canvas>
    </Boundary>
  );
}
