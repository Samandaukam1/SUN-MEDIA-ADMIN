import assert from 'node:assert/strict';
import test from 'node:test';

import { depthAt, FRAME, PARTS, sculpt } from '../components/assistant/robot/sculpt.ts';

// A synthetic picture with the robot's layout: an opaque blob covering every part's region (the real alpha comes from
// the master render; the properties below hold for any picture).
const SIZE = 314;
const alpha = new Uint8Array(SIZE * SIZE);
const inside = (poly, x, y) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
for (let y = 0; y < SIZE; y++)
  for (let x = 0; x < SIZE; x++) {
    const u = ((x + 0.5) / SIZE) * FRAME;
    const v = ((y + 0.5) / SIZE) * FRAME;
    const inHead = inside(PARTS[2].region, u, v) && (u - 640) ** 2 / 400 ** 2 + (v - 330) ** 2 / 280 ** 2 < 1;
    const inBody = (u - 660) ** 2 / 210 ** 2 + (v - 880) ** 2 / 300 ** 2 < 1;
    const inArms = inside(PARTS[0].region, u, v) || inside(PARTS[1].region, u, v);
    alpha[y * SIZE + x] = inHead || inBody || inArms ? 255 : 0;
  }
const SCALE = 2.46 / FRAME;
const CENTER = [FRAME / 2, 620];
const parts = sculpt(alpha, SIZE, { scale: SCALE, center: CENTER, step: 10 });

test('every part is a real volume: indexed triangles, unit normals, front and back', () => {
  assert.deepEqual(
    parts.map((p) => p.name),
    ['armL', 'armR', 'head', 'body'],
  );
  for (const p of parts) {
    assert.ok(p.index.length > 300 && p.index.length % 3 === 0, p.name);
    for (const i of p.index) assert.ok(i < p.positions.length / 3);
    for (let i = 0; i < p.normals.length; i += 3) assert.ok(Math.abs(Math.hypot(p.normals[i], p.normals[i + 1], p.normals[i + 2]) - 1) < 1e-4);
    let zmin = Infinity;
    let zmax = -Infinity;
    for (let i = 2; i < p.positions.length; i += 3) {
      zmin = Math.min(zmin, p.positions[i]);
      zmax = Math.max(zmax, p.positions[i]);
    }
    assert.ok(zmax - zmin > 0.1, `${p.name} has depth`);
  }
});

test('seen from the front at rest, every painted vertex shows its own picture pixel', () => {
  for (const p of parts)
    for (let i = 0; i < p.front.length; i++) {
      if (!p.front[i]) continue;
      const u = (p.positions[i * 3] + p.pivot[0]) / SCALE + CENTER[0];
      const v = CENTER[1] - (p.positions[i * 3 + 1] + p.pivot[1]) / SCALE;
      assert.ok(Math.abs(u - p.uvs[i * 2] * FRAME) < 1e-3 && Math.abs(v - (1 - p.uvs[i * 2 + 1]) * FRAME) < 1e-3, p.name);
    }
});

test('the back and the hidden parts are never painted; the front is', () => {
  for (const p of parts) {
    let painted = 0;
    for (let i = 0; i < p.front.length; i++) {
      if (!p.front[i]) continue;
      painted++;
      // A painted vertex faces the viewer (or lies on the outline).
      assert.ok(p.normals[i * 3 + 2] > -1e-6, p.name);
    }
    assert.ok(painted > p.front.length * 0.3 && painted < p.front.length * 0.7, `${p.name}: front ≈ half the vertices`);
  }
});

test('the outline stays inside the picture: no vertex outside its opaque area', () => {
  for (const p of parts)
    for (let i = 0; i < p.positions.length; i += 3) {
      const u = (p.positions[i] + p.pivot[0]) / SCALE + CENTER[0];
      const v = CENTER[1] - (p.positions[i + 1] + p.pivot[1]) / SCALE;
      const x = Math.min(SIZE - 1, Math.max(0, Math.round((u / FRAME) * SIZE - 0.5)));
      const y = Math.min(SIZE - 1, Math.max(0, Math.round((v / FRAME) * SIZE - 0.5)));
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = alpha[Math.min(SIZE - 1, Math.max(0, y + dy)) * SIZE + Math.min(SIZE - 1, Math.max(0, x + dx))] > 0;
      assert.ok(near, `${p.name} vertex at ${u.toFixed(0)},${v.toFixed(0)}`);
    }
});

test('the face can be placed on the visor: the head front is in front of its joint and smooth', () => {
  const head = parts.find((p) => p.name === 'head');
  const a = depthAt(head, 560, 320);
  const b = depthAt(head, 870, 380);
  assert.ok(a > 0 && b > 0, 'visor faces the viewer');
  assert.ok(Math.abs(a - b) < 0.05, 'and is flat across the eyes');
});
