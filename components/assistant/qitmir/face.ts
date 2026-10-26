import * as THREE from 'three';

import type { RobotRig } from '../robot/model';

/**
 * Qitmir mode's face, on the original robot: no new parts, only its own eye and smile decals recoloured and turned.
 * The decals add lime light onto the black visor; multiplied by this colour the lime (almost no blue, little red left
 * after the green is taken out) becomes a clean red with its own glow.
 */
export const QITMIR_RED = new THREE.Color(1.45, 0.025, 0.12);
/** The light the robot casts on itself (and the motes around it) while the mode is on. */
export const QITMIR_LIGHT = new THREE.Color('#ff3348');
/** At full squint the eyes close this much and each turns in this far (radians): cunning at 0.35, angry at 1. */
export const SQUINT = { close: 0.4, slant: 0.45 };
/** At full smirk the smile flattens this much and tilts this far: one corner up. */
export const SMIRK = { flatten: 0.35, tilt: 0.16, wink: 0.24 };
/** The look while nothing else is going on: a little serious, a little sly. */
export const QITMIR_REST = { squint: 0.4, smirk: 0.7 };

/** Turns the eyes in and tilts the smile (the renderer sets their sizes from the pose, see `squinted` / `smirked`). */
export function qitmirTurns(rig: RobotRig, squint: number, smirk: number) {
  // Screen-left eye: its inner (right) end down is a clockwise turn; the right eye mirrors it.
  rig.lids[0].rotation.z = -SQUINT.slant * squint;
  rig.lids[1].rotation.z = SQUINT.slant * squint;
  rig.mouth.smile.rotation.z = SMIRK.tilt * smirk;
}
/**
 * How open each eye is: the squint narrows both; the smirk narrows the screen-left one a little more — the lopsided,
 * cunning look (`eye` 0 is the screen-left eye).
 */
export const squinted = (eyeOpen: number, squint: number, smirk = 0, eye = 1) => eyeOpen * (1 - SQUINT.close * squint - (eye === 0 ? SMIRK.wink * smirk : 0));
export const smirked = (smile: number, smirk: number) => smile * (1 - SMIRK.flatten * smirk);
