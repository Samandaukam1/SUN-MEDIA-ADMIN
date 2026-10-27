'use client';

import { PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';

import type { Expression, FeelEvent } from '../robot/emotion';
import { buildRobot, FRAME_OFFSET_Y, FRAME_WORLD, HEIGHT } from '../robot/model';
import { MotionDirector, type MotionMood, type Pose } from '../robot/motion';
import type { SoundSubscribe } from '../voice';
import { Boundary, loadPicture, Studio } from '../robot/Robot3D';
import type { Sculpted } from '../robot/sculpt';
import { GRIP_ARM, QitmirBrain, type Game, type Persona, type QPose, type Vec2, type Vec3 } from './brain';
import { interactive, QitmirDom } from './dom';
import { QITMIR_LIGHT, QITMIR_REST, QITMIR_RED, qitmirTurns, smirked, squinted } from './face';
import { say } from './quips';
import './qitmir.css';

type Props = {
  /** The robot's size while it plays, px. */
  box: number;
  touch: boolean;
  /** Weak device or data saver: lower resolution, no trail or halo. */
  lite: boolean;
  /** Fly home and stay there: the mode is off or paused, the chat is open or busy. */
  dock: boolean;
  /** The mode itself: the red eyes fade out on the way home after it is turned off. */
  on: boolean;
  chat: MotionMood;
  cursorFx: boolean;
  /** A local command for one of its tricks ("salto qil"…), new on each id. */
  command?: { name: string; id: number };
  /** 'qitmir' plays with the cursor; 'calm' (normal mode) takes short trips while the person is idle. */
  persona: Persona;
  /** The current feeling (emotion.ts): posture, face and mood physics. */
  emotion?: Expression;
  /** Something happened to the robot (a pat, a push, a high five…) for the emotion engine. */
  onFeel?: (kind: FeelEvent) => void;
  /** A voice conversation while it is out: it listens, thinks and speaks where it is. */
  talk?: boolean;
  /** The live voice / microphone (loudness and mouth shape) while it talks. */
  sound?: SoundSubscribe;
  /** Where it is while it talks (screen x), for the voice's direction. */
  onSpot?: (x: number) => void;
  /** The tab is visible. */
  active: boolean;
  /** The launcher's robot square: where the robot takes off and lands. */
  home: RefObject<HTMLElement | null>;
  onOut: () => void;
  onDocked: () => void;
  onFail: () => void;
};

/** The canvas around the robot, in robot sizes: room to tumble without clipping. */
const ROOM = 2.4;
const LIME = new THREE.Color('#d4fc18');
const tint = new THREE.Color();
const euler = new THREE.Euler();
const quat = new THREE.Quaternion();
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);
const slerpTo = (obj: THREE.Object3D, [x, y, z]: Vec3, t: number) => obj.quaternion.slerp(quat.setFromEuler(euler.set(x, y, z)), t);
const forward = new THREE.Vector3();
const now = () => performance.now() / 1000;

/** Home: the launcher robot's origin on screen and its size relative to the playing size (null while it is hidden). */
function homeOf(el: HTMLElement | null, box: number): { x: number; y: number; scale: number } | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 - FRAME_OFFSET_Y * (r.width / FRAME_WORLD), scale: r.width / box };
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

type Fx = {
  stage: HTMLDivElement | null;
  wrap: HTMLDivElement | null;
  shadow: HTMLDivElement | null;
  tether: SVGPathElement | null;
  ring: SVGEllipseElement | null;
  bubble: HTMLDivElement | null;
  zzz: HTMLDivElement | null;
  trail: HTMLElement[];
};

function Player({
  images,
  brain,
  dom,
  fx,
  props,
  audio,
}: {
  images: { body: HTMLImageElement; face: HTMLImageElement; parts: Sculpted[] };
  brain: QitmirBrain;
  dom: QitmirDom;
  fx: RefObject<Fx>;
  props: RefObject<Props & { onHidden: () => void }>;
  audio: RefObject<{ level: number; shape: number }>;
}) {
  const { gl, scene, camera } = useThree();
  const rig = useMemo(() => buildRobot(images.body, images.face, images.parts), [images]);
  const light = useRef<THREE.PointLight>(null);
  const envSet = useRef(false);
  const red = useRef(props.current.on ? 1 : 0);
  const glow = useRef(0.5);
  // Talking in place: the launcher robot's own director gives the listening / thinking / speaking poses and the mouth.
  const director = useMemo(() => new MotionDirector({ float: 0 }), []);
  const run = useRef({ spotAt: -1e9, state: '', fadeFrom: 1, homeAt: -1e9, home: null as ReturnType<typeof homeOf>, shown: false, fading: -1, clip: '', sayAt: -1e9, bubbleUntil: 0, trail: [] as Vec2[], last: null as QPose | null });

  // Extras owned by the stage (removed with it): a soft red light behind the eyes.
  const halo = useMemo(() => {
    const map = glowTexture();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: QITMIR_LIGHT, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }));
    s.scale.set(1.25, 0.7, 1);
    s.renderOrder = 1;
    return s;
  }, []);
  // The anti-gravity thruster: a soft glow under the robot and a short beam, brighter as it accelerates (lime; red in
  // Qitmir mode). Fixed to the body, so it tilts with it. Additive, no post-processing.
  const thruster = useMemo(() => {
    const group = new THREE.Group();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: LIME, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.scale.set(0.7, 0.26, 1);
    const fade = document.createElement('canvas');
    fade.width = 4;
    fade.height = 64;
    const fg = fade.getContext('2d')!;
    const grad = fg.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    fg.fillStyle = grad;
    fg.fillRect(0, 0, 4, 64);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.03, 1, 20, 1, true).translate(0, -0.5, 0),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(fade), color: LIME, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    group.add(glow, beam);
    group.position.set(0.03, -HEIGHT / 2 + 0.04, 0);
    return { group, glow, beam };
  }, []);
  useEffect(() => {
    rig.spin.add(thruster.group);
    return () => {
      rig.spin.remove(thruster.group);
      const gm = thruster.glow.material as THREE.SpriteMaterial;
      gm.map?.dispose();
      gm.dispose();
      const bm = thruster.beam.material as THREE.MeshBasicMaterial;
      bm.map?.dispose();
      bm.dispose();
      thruster.beam.geometry.dispose();
    };
  }, [rig, thruster]);

  useEffect(() => {
    rig.eyes.add(halo);
    halo.position.set(0, 0, 0.01);
    // Measure the raised hand with the arm in its grip pose: the brain hangs the robot from that point.
    rig.armL.rotation.set(...GRIP_ARM);
    rig.root.updateMatrixWorld(true);
    const mesh = rig.armL.children[0] as THREE.Mesh;
    const pos = mesh.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    const tip = new THREE.Vector3();
    let best = -1;
    for (let i = 0; i < pos.count; i += 2) {
      v.fromBufferAttribute(pos, i);
      if (v.lengthSq() > best) {
        best = v.lengthSq();
        tip.copy(v);
      }
    }
    tip.applyMatrix4(mesh.matrixWorld);
    const px = props.current.box / FRAME_WORLD;
    brain.setGrip([tip.x * px, -tip.y * px]);
    rig.armL.rotation.set(0, 0, 0);
    return () => {
      rig.eyes.remove(halo);
      (halo.material as THREE.SpriteMaterial).map?.dispose();
      halo.material.dispose();
      rig.dispose();
    };
  }, [rig, halo, brain, props]);

  useFrame((_, rawDt) => {
    const P = props.current;
    const F = fx.current;
    const R = run.current;
    const t = now();
    const dt = Math.min(rawDt, 0.05);
    if (!envSet.current && scene.environment) {
      for (const m of rig.pbr) {
        m.envMap = scene.environment;
        m.needsUpdate = true;
      }
      envSet.current = true;
    }

    // Inputs: home (every frame only while it matters), the page's targets, who has the person's attention.
    const docking = brain.state === 'RETURNING' || !R.shown;
    if (docking || t - R.homeAt > 0.5) {
      R.home = homeOf(P.home.current, P.box);
      R.homeAt = t;
      brain.setHome(R.home);
    }
    const targets = dom.refresh(t);
    if (targets) brain.setTargets(targets);
    brain.setFlags({ dock: P.dock || dom.busy(t), chat: P.chat, cursorFx: P.cursorFx, talk: !!P.talk });
    const pose = brain.update(t);
    // The state, for QA and the browser tests (written only when it changes).
    if (brain.state !== R.state && F.stage) F.stage.dataset.state = R.state = brain.state;

    for (const e of brain.drain()) {
      if (e.type === 'out') {
        R.shown = true;
        R.fading = -1;
        P.onOut();
      } else if (e.type === 'docked') {
        R.fading = t;
        R.fadeFrom = R.last?.alpha ?? 1;
        P.onDocked();
      } else if (e.type === 'poke') dom.poke(e.id);
      else if (e.type === 'feel') P.onFeel?.(e.kind);
      else if (e.type === 'say' && t - R.sayAt > 4.5 && F.bubble) {
        R.sayAt = t;
        R.bubbleUntil = t + 1.9;
        F.bubble.textContent = say(e.key);
      }
    }

    // Docked: the launcher robot is drawn instead; this one fades its last frame out, then rests (nothing drawn).
    const shown = pose.visible ? pose : R.last;
    if (!pose.visible) {
      const k = R.fading < 0 ? 0 : R.fadeFrom * (1 - (t - R.fading) / 0.2);
      if (F.wrap) F.wrap.style.opacity = String(Math.max(0, k));
      if (k <= 0) {
        if (F.shadow) F.shadow.style.opacity = '0';
        // Faded out: only now may the stage stop drawing (its last frame must not stay on screen).
        if (R.shown) P.onHidden();
        R.shown = false;
        return;
      }
    } else if (F.wrap) F.wrap.style.opacity = String(pose.alpha);
    if (!shown) return;
    R.last = shown;

    const S = Math.round(P.box * ROOM);
    const dpr = gl.getPixelRatio();
    const left = shown.x - S / 2;
    const top = shown.y - S / 2;
    // The canvas moves on whole device pixels (sharp); the rest of the way is done inside the scene.
    const il = Math.round(left * dpr) / dpr;
    const it = Math.round(top * dpr) / dpr;
    if (F.wrap) {
      F.wrap.style.transform = `translate3d(${il}px, ${it}px, 0)`;
      let clip = '';
      if (shown.clip) {
        const e = Math.min(S, Math.max(0, shown.clip.edge - it));
        const l = Math.min(S, Math.max(0, shown.clip.left - il));
        const r = Math.min(S, Math.max(0, shown.clip.right - il));
        clip = `polygon(0 0, ${S}px 0, ${S}px ${S}px, ${r}px ${S}px, ${r}px ${e}px, ${l}px ${e}px, ${l}px ${S}px, 0 ${S}px)`;
      }
      if (clip !== R.clip) {
        F.wrap.style.clipPath = clip;
        R.clip = clip;
      }
    }
    rig.root.position.set(left - il, -(top - it), 0);
    rig.root.scale.setScalar((P.box / FRAME_WORLD) * shown.scale);
    rig.root.quaternion.set(shown.orient[0], shown.orient[1], shown.orient[2], shown.orient[3]);
    let talk: Pose | null = null;
    if (brain.state === 'TALKING') {
      director.setMood(P.chat, t);
      talk = director.update(t, audio.current.level, audio.current.shape);
      if (t - R.spotAt > 0.25) {
        R.spotAt = t;
        P.onSpot?.(shown.x);
      }
    }
    slerpTo(rig.body, talk ? talk.body : shown.body, damp(8, dt));
    slerpTo(rig.head, talk ? talk.head : shown.head, damp(9, dt));
    slerpTo(rig.armL, talk ? talk.armL : shown.armL, damp(12, dt));
    slerpTo(rig.armR, talk ? talk.armR : shown.armR, damp(9, dt));

    // Face: the original eyes and smile, red and sly; easing back to lime when the mode is turned off.
    red.current = THREE.MathUtils.lerp(red.current, P.on ? 1 : 0, damp(3, dt));
    const q = red.current;
    const squint = (talk ? QITMIR_REST.squint : shown.squint) * q;
    const smirk = (talk ? QITMIR_REST.smirk : shown.smirk) * q;
    const eyeOpen = talk ? talk.eyeOpen : shown.eyeOpen;
    const look = talk ? talk.look : shown.look;
    qitmirTurns(rig, squint, smirk);
    rig.lids.forEach((lid, i) => (lid.scale.y = THREE.MathUtils.lerp(lid.scale.y, squinted(eyeOpen, squint, smirk, i), damp(eyeOpen < 0.5 ? 40 : 14, dt))));
    rig.eyes.position.x = THREE.MathUtils.lerp(rig.eyes.position.x, rig.eyeRest.x + look[0] * 0.035, damp(12, dt));
    rig.eyes.position.y = THREE.MathUtils.lerp(rig.eyes.position.y, rig.eyeRest.y + look[1] * 0.025, damp(12, dt));
    const mouth = rig.mats;
    mouth.smile.opacity = THREE.MathUtils.lerp(mouth.smile.opacity, talk && (talk.talk || talk.flat) ? 0 : 1, damp(14, dt));
    mouth.flat.opacity = THREE.MathUtils.lerp(mouth.flat.opacity, talk && talk.flat && !talk.talk ? 1 : 0, damp(14, dt));
    mouth.talk.opacity = THREE.MathUtils.lerp(mouth.talk.opacity, talk ? talk.talk : 0, damp(14, dt));
    rig.mouth.smile.scale.y = THREE.MathUtils.lerp(rig.mouth.smile.scale.y, smirked(talk ? talk.smile : shown.smile, smirk), damp(10, dt));
    if (talk) {
      // The talking mouth follows the real audio, as on the launcher robot.
      const loud = Math.sqrt(Math.min(1, talk.mouthOpen));
      rig.mouth.talk.scale.set(
        THREE.MathUtils.lerp(rig.mouth.talk.scale.x, 0.8 + talk.mouthWide * 0.3 - loud * 0.2, damp(25, dt)),
        THREE.MathUtils.lerp(rig.mouth.talk.scale.y, 0.17 + loud * 0.75, damp(25, dt)),
        1,
      );
    }
    glow.current = THREE.MathUtils.lerp(glow.current, (talk ? talk.glow : shown.glow) + shown.anger * 0.6, damp(8, dt));
    tint.setScalar(1).lerp(QITMIR_RED, q).multiplyScalar(0.875 + glow.current * 0.5);
    rig.mats.face.color.copy(tint);
    rig.mats.smile.color.copy(tint);
    if (light.current) {
      light.current.intensity = 0.6 + glow.current * 1.8;
      light.current.color.copy(LIME).lerp(QITMIR_LIGHT, q);
    }
    const hm = halo.material as THREE.SpriteMaterial;
    // Only while the face is toward the viewer (it is drawn over the head, not through it).
    const facing = Math.max(0, forward.set(0, 0, 1).applyQuaternion(rig.head.getWorldQuaternion(quat)).z);
    hm.opacity = P.lite ? 0 : (0.1 + 0.22 * glow.current) * q * facing;
    halo.visible = hm.opacity > 0.005;
    const pm = rig.particles.material as THREE.PointsMaterial;
    pm.color.copy(LIME).lerp(QITMIR_LIGHT, q);
    pm.opacity = THREE.MathUtils.lerp(pm.opacity, (talk ? talk.energy : shown.energy) * 0.9, damp(6, dt));
    rig.particles.visible = pm.opacity > 0.01;
    if (rig.particles.visible) rig.particles.rotation.y += dt * (1.2 + shown.energy * 3);
    rig.ring.visible = false;
    const th = shown.thrust;
    const gm = thruster.glow.material as THREE.SpriteMaterial;
    const bm = thruster.beam.material as THREE.MeshBasicMaterial;
    gm.color.copy(LIME).lerp(QITMIR_LIGHT, q);
    bm.color.copy(gm.color);
    gm.opacity = 0.12 + 0.5 * th;
    thruster.glow.scale.set(0.55 + 0.35 * th, 0.2 + 0.1 * th, 1);
    bm.opacity = Math.max(0, th - 0.15) * 0.55;
    thruster.beam.visible = bm.opacity > 0.01;
    thruster.beam.scale.set(1, 0.12 + 0.75 * th, 1);

    // Page effects: the contact shadow where it stands, the tether while it holds the cursor, a short trail at speed.
    const B = P.box;
    if (F.shadow) {
      const s = shown.shadow;
      F.shadow.style.opacity = s ? String(s.o) : '0';
      if (s) F.shadow.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) scale(${s.w / 100}, ${Math.max(0.12, s.w / 360)})`;
    }
    if (F.tether && F.ring) {
      const tt = shown.tether;
      if (tt) {
        const sag = (1 - tt.tension) * 16;
        const mx = (tt.hx + tt.px) / 2;
        const my = (tt.hy + tt.py) / 2 + sag;
        F.tether.setAttribute('d', `M${tt.px.toFixed(1)} ${tt.py.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${tt.hx.toFixed(1)} ${tt.hy.toFixed(1)}`);
        F.tether.style.opacity = String(0.45 + 0.45 * tt.tension);
        // The ring sits exactly on the real pointer (never offset from it) and stretches toward the robot as it pulls.
        const a = (Math.atan2(tt.hy - tt.py, tt.hx - tt.px) * 180) / Math.PI;
        F.ring.setAttribute('transform', `translate(${tt.px.toFixed(1)} ${tt.py.toFixed(1)}) rotate(${a.toFixed(1)})`);
        F.ring.setAttribute('rx', (10 + 7 * tt.tension).toFixed(1));
        F.ring.setAttribute('ry', (10 - 3 * tt.tension).toFixed(1));
        F.ring.style.opacity = '1';
      } else {
        F.tether.style.opacity = '0';
        F.ring.style.opacity = '0';
      }
    }
    if (!P.lite && F.trail.length) {
      R.trail.unshift([shown.x, shown.y]);
      if (R.trail.length > F.trail.length * 3) R.trail.length = F.trail.length * 3;
      const k = Math.min(1, Math.max(0, (shown.speed - 6 * B) / (5 * B)));
      F.trail.forEach((dot, i) => {
        const at = R.trail[Math.min(R.trail.length - 1, (i + 1) * 3)];
        dot.style.opacity = String(k * 0.55 * (1 - i / F.trail.length));
        if (at) dot.style.transform = `translate3d(${at[0]}px, ${at[1]}px, 0)`;
      });
    }
    if (F.bubble) {
      const visible = t < R.bubbleUntil;
      F.bubble.style.opacity = visible ? '1' : '0';
      if (visible) {
        const by = Math.max(8, shown.y - 0.55 * B * shown.scale - 34);
        const bx = Math.min(innerWidth - 8, Math.max(8, shown.x));
        F.bubble.style.transform = `translate3d(${bx}px, ${by}px, 0) translateX(-50%)`;
      }
    }
    if (F.zzz) {
      F.zzz.style.opacity = shown.sleep ? '1' : '0';
      if (shown.sleep) F.zzz.style.transform = `translate3d(${shown.x + 0.25 * B * shown.scale}px, ${shown.y - 0.5 * B * shown.scale}px, 0)`;
    }
    gl.render(scene, camera);
  }, 1);

  return (
    <>
      <primitive object={rig.root} />
      <pointLight ref={light} position={[0, -props.current.box * 0.6, props.current.box * 0.3]} color={LIME} intensity={0.6} distance={props.current.box * 1.6} decay={0} />
    </>
  );
}

/**
 * Qitmir mode's stage: the robot out of its launcher, anywhere in the viewport. A fixed layer that never takes a
 * click (pointer-events: none) holds a small transparent canvas that moves with the robot — the GPU only ever draws a
 * square around it, never the whole screen — plus the page effects (contact shadow, tether, trail, its remarks).
 * Mounted only while the mode plays; everything it added is removed when it unmounts.
 */
export default function QitmirStage(props: Props) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const [images, setImages] = useState<{ body: HTMLImageElement; face: HTMLImageElement; parts: Sculpted[] } | null>(null);
  const [dpr, setDpr] = useState(() => Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, props.lite ? 1.25 : 2));
  const [docked, setDocked] = useState(true);
  const fx = useRef<Fx>({ stage: null, wrap: null, shadow: null, tether: null, ring: null, bubble: null, zzz: null, trail: [] });
  // One brain and one page reader per stage; the props are read every frame instead.
  const [brain] = useState(() => new QitmirBrain({ box: props.box, touch: props.touch, persona: props.persona, now: now(), home: homeOf(props.home.current, props.box), viewport: [innerWidth, innerHeight] }));
  const [dom] = useState(() => new QitmirDom());
  // R3F drops the WebGL context a moment after the canvas unmounts: only a loss while the stage is up is a failure.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const fail = useCallback(() => {
    if (alive.current) propsRef.current.onFail();
  }, []);
  const onOut = useCallback(() => {
    setDocked(false);
    propsRef.current.onOut();
  }, []);
  const onHidden = useCallback(() => setDocked(true), []);
  // The live sound while it talks in place (written by the voice, read every frame).
  const audio = useRef({ level: 0, shape: 0.5 });
  const { talk, sound, chat } = props;
  useEffect(() => {
    audio.current = { level: 0, shape: 0.5 };
    if (!talk || !sound || (chat !== 'speaking' && chat !== 'listening')) return;
    return sound((f) => {
      audio.current.level = f.level;
      audio.current.shape = f.shape;
    });
  }, [talk, sound, chat]);
  const relay = useRef({ ...props, onOut, onHidden });
  relay.current = { ...props, onOut, onHidden };

  useEffect(() => {
    let live = true;
    loadPicture()
      .then((p) => live && setImages(p))
      .catch(() => live && fail());
    return () => {
      live = false;
    };
  }, [fail]);

  useEffect(() => {
    // A trick on request may bring it out of the launcher: draw again.
    if (props.command && brain.command(props.command.name, now())) setDocked(false);
  }, [brain, props.command]);
  useEffect(() => brain.setPersona(props.persona), [brain, props.persona]);
  useEffect(() => {
    if (props.emotion) brain.setEmotion(props.emotion);
  }, [brain, props.emotion]);

  // Resting in the launcher in normal mode: nothing is drawn; about once a second the robot is asked whether it wants
  // to go on a trip (the person idle for a while, something worth a visit on the page).
  useEffect(() => {
    if (!docked || props.persona !== 'calm' || !props.active) return;
    const id = setInterval(() => {
      const t = now();
      const P = propsRef.current;
      brain.setHome(homeOf(P.home.current, P.box));
      const targets = dom.refresh(t);
      if (targets) brain.setTargets(targets);
      brain.setFlags({ dock: P.dock || dom.busy(t), chat: P.chat, cursorFx: P.cursorFx });
      if (brain.wantsOut(t)) setDocked(false);
    }, 1000);
    return () => clearInterval(id);
  }, [docked, props.persona, props.active, brain, dom]);

  // Development only: a handle for QA and the browser tests (state, and a game on demand). Not in production builds.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const w = window as Window & { __qitmir?: unknown };
    w.__qitmir = {
      state: () => brain.state,
      play: (game: Game) => brain.play(game, now()),
      command: (name: string) => brain.command(name, now()),
      debug: () => ({ ...brain.debug, dockProp: propsRef.current.dock, pageBusy: dom.busy(now()) }),
    };
    return () => void delete w.__qitmir;
  }, [brain, dom]);

  // The person: pointer, keys, scroll. All passive — nothing is prevented, captured or locked.
  useEffect(() => {
    dom.start();
    const sel = () => brain.setFlags({ selecting: dom.selecting() });
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') brain.setFlags({ interactive: interactive(e.target) });
      brain.pointer('move', e.clientX, e.clientY, now());
    };
    const down = (e: PointerEvent) => brain.pointer('down', e.clientX, e.clientY, now());
    const up = (e: PointerEvent) => {
      brain.pointer('up', e.clientX, e.clientY, now());
      sel();
    };
    const leave = (e: PointerEvent) => {
      if (!e.relatedTarget) brain.pointer('leave', e.clientX, e.clientY, now());
    };
    const blur = () => brain.pointer('leave', 0, 0, now());
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') brain.escape(now());
      else brain.activity(now());
    };
    const busy = () => brain.activity(now());
    const resize = () => brain.setViewport(innerWidth, innerHeight);
    const opts = { passive: true } as const;
    window.addEventListener('pointermove', move, opts);
    window.addEventListener('pointerdown', down, opts);
    window.addEventListener('pointerup', up, opts);
    window.addEventListener('pointercancel', up, opts);
    document.addEventListener('pointerout', leave, opts);
    window.addEventListener('blur', blur);
    window.addEventListener('keydown', key);
    window.addEventListener('wheel', busy, opts);
    document.addEventListener('scroll', busy, { capture: true, passive: true });
    document.addEventListener('selectionchange', sel);
    window.addEventListener('resize', resize, opts);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.removeEventListener('pointerout', leave);
      window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', key);
      window.removeEventListener('wheel', busy);
      document.removeEventListener('scroll', busy, { capture: true });
      document.removeEventListener('selectionchange', sel);
      window.removeEventListener('resize', resize);
      dom.dispose();
    };
  }, [brain, dom]);

  const S = Math.round(props.box * ROOM);
  // Nothing to draw while it rests in the launcher with no reason to leave.
  const running = props.active && !(docked && (props.dock || props.persona === 'calm'));
  return (
    <div className="qm-stage" aria-hidden ref={(el) => void (fx.current.stage = el)}>
      <div className="qm-shadow" ref={(el) => void (fx.current.shadow = el)} />
      <svg className="qm-fx">
        <path ref={(el) => void (fx.current.tether = el)} className="qm-tether" />
        <ellipse ref={(el) => void (fx.current.ring = el)} className="qm-ring" rx="10" ry="10" />
      </svg>
      {props.lite
        ? null
        : [0, 1, 2, 3, 4].map((i) => (
            <i
              key={i}
              className="qm-trail"
              ref={(el) => {
                if (el) fx.current.trail[i] = el;
              }}
            />
          ))}
      <div className="qm-bot" ref={(el) => void (fx.current.wrap = el)} style={{ width: S, height: S, opacity: 0 }}>
        {images ? (
          <Boundary onFail={fail}>
            <Canvas
              dpr={dpr}
              orthographic
              frameloop={running ? 'always' : 'never'}
              camera={{ position: [0, 0, 2000], zoom: 1, near: 1, far: 6000 }}
              gl={{ antialias: !props.lite, alpha: true, powerPreference: 'default', premultipliedAlpha: true }}
              resize={{ scroll: false }}
              onCreated={({ gl }) => {
                gl.setClearColor(0x000000, 0);
                gl.toneMapping = THREE.NoToneMapping;
                gl.domElement.addEventListener('webglcontextlost', fail, { once: true });
              }}
              style={{ pointerEvents: 'none' }}
            >
              <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(1, Math.min(d, 1.5) - 0.25))} />
              <Studio />
              <Player images={images} brain={brain} dom={dom} fx={fx} props={relay} audio={audio} />
            </Canvas>
          </Boundary>
        ) : null}
      </div>
      <div className="qm-zzz" ref={(el) => void (fx.current.zzz = el)}>
        <i>z</i>
        <i>z</i>
        <i>z</i>
      </div>
      <div className="qm-say" ref={(el) => void (fx.current.bubble = el)} />
    </div>
  );
}
