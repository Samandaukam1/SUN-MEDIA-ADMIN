'use client';

import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';

import type { SoundSubscribe } from '../voice';
import { buildRobot, HEIGHT } from './model';
import { MotionDirector, type MotionCue, type MotionMood } from './motion';

const LIME = '#d4fc18';

export type RobotCue = { name: MotionCue; id: number };
type Props = {
  mood: MotionMood;
  sound?: SoundSubscribe;
  cue?: RobotCue;
  /** Size of the robot's square on the page, px; the canvas is larger so it can fly and turn without clipping. */
  box: number;
  /** Room around the square (left and above), px. */
  room: number;
  calm: boolean;
  compact: boolean;
  /** No flight while the chat panel is open next to it. */
  roam: boolean;
  active: boolean;
  onReady: () => void;
  onFail: () => void;
};

/** WebGL errors (lost context, shader failure) hand the launcher back to the 2D robot instead of breaking the page. */
class Boundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
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

function Robot({ mood, sound, cue, box, room, calm, compact, roam, shadows }: Omit<Props, 'active' | 'onReady' | 'onFail'> & { shadows: boolean }) {
  const rig = useMemo(() => buildRobot(), []);
  const { viewport, size, clock, gl, scene } = useThree();
  const envSet = useRef(false);
  const director = useMemo(() => new MotionDirector({ calm, compact, now: 0 }), [calm, compact]);
  const audio = useRef({ level: 0, shape: 0.5 });
  const pointer = useRef({ x: 0, y: 0, near: false });
  const light = useRef<THREE.PointLight>(null);

  useEffect(() => () => rig.dispose(), [rig]);
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
      const cx = r.right - box / 2;
      const cy = r.bottom - box / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
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

  // Scale and resting place from the canvas size: the robot fills its square, which sits at the canvas' bottom right.
  const unit = viewport.height / size.height;
  const scale = (box * 0.86 * unit) / HEIGHT;
  const rest = useMemo(() => new THREE.Vector3(viewport.width / 2 - (box / 2) * unit, -viewport.height / 2 + (box / 2) * unit, 0), [viewport.width, viewport.height, box, unit]);
  const target = useMemo(() => new THREE.Vector3(), []);
  const reach = HEIGHT * scale;

  useEffect(() => {
    rig.root.position.copy(rest);
    rig.root.scale.setScalar(scale);
  }, [rig, rest, scale]);

  useFrame((_, rawDt) => {
    // three.js applies envMapIntensity only to a material's own envMap: hand each one the studio once it exists.
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

    // Face: blink fast, look smoothly, mouths cross-fade, the talking mouth follows the audio closely.
    rig.eyes.scale.y = THREE.MathUtils.lerp(rig.eyes.scale.y, pose.eyeOpen, damp(pose.eyeOpen < 0.5 ? 40 : 14, dt));
    rig.eyes.position.x = THREE.MathUtils.lerp(rig.eyes.position.x, pose.look[0] * 0.07, damp(12, dt));
    rig.eyes.position.y = THREE.MathUtils.lerp(rig.eyes.position.y, 0.56 + pose.look[1] * 0.05, damp(12, dt));
    const { smile, flat, talk } = rig.mats;
    smile.opacity = THREE.MathUtils.lerp(smile.opacity, pose.talk || pose.flat ? 0 : 1, damp(14, dt));
    flat.opacity = THREE.MathUtils.lerp(flat.opacity, pose.flat && !pose.talk ? 1 : 0, damp(14, dt));
    talk.opacity = THREE.MathUtils.lerp(talk.opacity, pose.talk, damp(14, dt));
    rig.mouth.smile.scale.y = THREE.MathUtils.lerp(rig.mouth.smile.scale.y, pose.smile, damp(10, dt));
    // sqrt: mid-loud syllables already open the mouth clearly; silence closes it to a slit.
    const loud = Math.sqrt(Math.min(1, pose.mouthOpen));
    const open = 0.14 + loud * 1.2;
    const wide = 0.72 + pose.mouthWide * 0.5 - loud * 0.12;
    rig.mouth.talk.scale.set(THREE.MathUtils.lerp(rig.mouth.talk.scale.x, wide, damp(25, dt)), THREE.MathUtils.lerp(rig.mouth.talk.scale.y, open, damp(25, dt)), 1);

    // Light: eye halos, lime accents and the glow from the ring below follow `glow`; the energy field follows `energy`.
    for (const h of rig.halos) (h.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.lerp((h.material as THREE.SpriteMaterial).opacity, 0.22 + pose.glow * 0.55, damp(10, dt));
    rig.mats.accent.emissiveIntensity = THREE.MathUtils.lerp(rig.mats.accent.emissiveIntensity, 0.8 + pose.glow * 2, damp(10, dt));
    if (light.current) light.current.intensity = THREE.MathUtils.lerp(light.current.intensity, 1.2 + pose.glow * 2.5, damp(8, dt));
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
  // (variance shadow map), and it shifts as the robot floats, turns and waves.
  const floor = rest.y - (box / 2 + 4) * unit;
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
    cam.near = 0.1;
    cam.far = reach * 6;
    cam.updateProjectionMatrix();
  }, [rest, floor, reach]);

  return (
    <>
      <primitive object={rig.root} />
      {shadows ? (
        <>
          <directionalLight
            ref={shadowLight}
            position={[rest.x - reach * 0.4, floor + reach * 3, reach * 0.9]}
            intensity={0.6}
            castShadow
            shadow-mapSize={[512, 512]}
            shadow-radius={9}
            shadow-blurSamples={16}
            shadow-bias={-0.0005}
          />
          {/* Tilted toward the camera like the neon ring's ellipse (~11° from above), so the shadow lies where the ring is. */}
          <mesh position={[rest.x, floor, 0]} rotation={[-Math.PI / 2 + 0.2, 0, 0]} receiveShadow>
            <planeGeometry args={[reach * 2.4, reach * 2.4]} />
            <shadowMaterial transparent opacity={0.45} />
          </mesh>
        </>
      ) : null}
      {/* The neon ring under the launcher lights the robot from below. */}
      <pointLight ref={light} position={[rest.x, rest.y - reach * 0.75, reach * 0.35]} color={LIME} intensity={1.2} distance={reach * 1.6} decay={2} />
    </>
  );
}

/**
 * Sunny in real 3D (three.js via React Three Fiber, already used by the site's hero). Transparent canvas over the
 * launcher; renders only while visible, at a pixel ratio that drops on weak GPUs. Lighting is a static studio
 * environment (computed once): soft key light, a rim light from behind, lime from the ring below; no post-processing.
 */
export default function Robot3D({ active, onReady, onFail, ...props }: Props) {
  const coarse = props.compact;
  const [dpr, setDpr] = useState(() => Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, coarse ? 1.5 : 2));
  return (
    <Boundary onFail={onFail}>
      <Canvas
        aria-hidden
        dpr={dpr}
        frameloop={active ? 'always' : 'never'}
        camera={{ position: [0, 0, 9], fov: 30 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'default', premultipliedAlpha: true }}
        shadows={coarse ? false : 'variance'}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.domElement.addEventListener('webglcontextlost', onFail, { once: true });
          requestAnimationFrame(() => requestAnimationFrame(onReady));
        }}
        style={{ pointerEvents: 'none' }}
      >
        <PerformanceMonitor onDecline={() => setDpr(1)} />
        <ambientLight intensity={0.22} />
        <directionalLight position={[-3, 4, 5]} intensity={1.6} color="#ffffff" />
        <directionalLight position={[4, 2.5, -4]} intensity={2.2} color="#e8f0ff" />
        {/* A bright studio, so the chrome reads as light silver like the rendered character, not as dark metal. */}
        <Environment resolution={128} frames={1}>
          <color attach="background" args={['#5a5c62']} />
          <Lightformer intensity={4} rotation-x={Math.PI / 2} position={[0, 6, 0]} scale={[14, 8, 1]} />
          <Lightformer intensity={2.2} position={[0, 0.5, 8]} scale={[14, 8, 1]} />
          <Lightformer intensity={2} rotation-y={Math.PI / 2} position={[-7, 1, 0]} scale={[18, 2, 1]} />
          <Lightformer intensity={1.8} rotation-y={-Math.PI / 2} position={[7, 0, 1]} scale={[18, 2.4, 1]} />
          <Lightformer intensity={1.2} rotation-x={-Math.PI / 2} position={[0, -6, 0]} scale={[14, 6, 1]} />
          <Lightformer form="ring" color={LIME} intensity={2.4} scale={2} position={[3, -3, 3]} target={[0, 0, 0]} />
        </Environment>
        <Robot {...props} shadows={!coarse} />
      </Canvas>
    </Boundary>
  );
}
