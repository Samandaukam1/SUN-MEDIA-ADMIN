// Exports Sunny's 3D model as a standalone GLB (for designers and other tools), built by the same code the site uses
// (components/assistant/robot/sculpt.ts) from the master render.
// Usage: node scripts/robot/export-glb.mjs "<master 1254×1254 RGBA png>" public/assistant/sunny.glb
// The texture is the master itself (face included) plus a silver swatch for the sides and back, so any glTF viewer
// shows the front exactly as the picture. Joints: body → head (neck), armL / armR (shoulders), in the picture's pose.
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

import { FRAME, sculpt } from '../../components/assistant/robot/sculpt.ts';

const [src, dst] = process.argv.slice(2);
if (!src || !dst) throw new Error('usage: export-glb.mjs <master.png> <out.glb>');

/** Minimal PNG decoder: 8-bit RGBA or RGB, non-interlaced (what the master render is). */
function readPng(buf) {
  let p = 8;
  let w = 0;
  let h = 0;
  let type = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const kind = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error('only 8-bit non-interlaced PNG');
      type = data[9];
    } else if (kind === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (!bpp) throw new Error('only RGB/RGBA PNG');
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4);
  const stride = w * bpp;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      const pa = Math.abs(b - c);
      const pb = Math.abs(a - c);
      const pc = Math.abs(a + b - 2 * c);
      const add = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      line[x] = (line[x] + add) & 255;
    }
    for (let x = 0; x < w; x++) {
      out[(y * w + x) * 4] = line[x * bpp];
      out[(y * w + x) * 4 + 1] = line[x * bpp + 1];
      out[(y * w + x) * 4 + 2] = line[x * bpp + 2];
      out[(y * w + x) * 4 + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { w, h, rgba: out };
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function writePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const chunk = (kind, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(kind, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const png = readPng(readFileSync(src));
if (png.w !== FRAME || png.h !== FRAME) throw new Error(`expected a ${FRAME}×${FRAME} master, got ${png.w}×${png.h}`);
const alpha = new Uint8Array(FRAME * FRAME);
for (let i = 0; i < alpha.length; i++) alpha[i] = png.rgba[i * 4 + 3];

// Same scale and centre as the site (model.ts): the frame is 2.46 units wide.
const SCALE = 2.46 / FRAME;
const parts = sculpt(alpha, FRAME, { scale: SCALE, center: [FRAME / 2, (56 + 1184) / 2], step: 4 });

// Texture: the master, plus a 32 px silver strip at the bottom for the unpainted faces (mid tone of the picture's silver).
const TW = FRAME;
const TH = FRAME + 32;
const tex = Buffer.alloc(TW * TH * 4);
png.rgba.copy(tex, 0);
for (let y = FRAME; y < TH; y++)
  for (let x = 0; x < TW; x++) tex.set([150, 153, 158, 255], (y * TW + x) * 4);
const silverUv = [0.5, (FRAME + 16) / TH];
const texPng = writePng(TW, TH, tex);

// glTF buffers.
const chunks = [];
let offset = 0;
const views = [];
const accessors = [];
const addView = (data, target) => {
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const pad = (4 - (offset % 4)) % 4;
  if (pad) {
    chunks.push(Buffer.alloc(pad));
    offset += pad;
  }
  views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) });
  chunks.push(bytes);
  offset += bytes.length;
  return views.length - 1;
};
const addAccessor = (data, type, componentType, target, minmax) => {
  const view = addView(data, target);
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[type];
  accessors.push({ bufferView: view, componentType, count: data.length / n, type, ...(minmax ?? {}) });
  return accessors.length - 1;
};
const bounds = (a) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < a.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], a[i + k]);
      max[k] = Math.max(max[k], a[i + k]);
    }
  return { min, max };
};

const meshes = parts.map((p) => {
  // Painted vertices keep their picture pixel; the others use the silver strip.
  const uv = new Float32Array(p.uvs.length);
  for (let i = 0; i < p.front.length; i++) {
    const painted = p.front[i] > 0.5;
    uv[i * 2] = painted ? p.uvs[i * 2] : silverUv[0];
    // glTF UV origin is the top-left: picture v (up) → texture row.
    uv[i * 2 + 1] = painted ? ((1 - p.uvs[i * 2 + 1]) * FRAME) / TH : silverUv[1];
  }
  const attributes = {
    POSITION: addAccessor(p.positions, 'VEC3', 5126, 34962, bounds(p.positions)),
    NORMAL: addAccessor(p.normals, 'VEC3', 5126, 34962),
    TEXCOORD_0: addAccessor(uv, 'VEC2', 5126, 34962),
  };
  const indices = addAccessor(p.index, 'SCALAR', 5125, 34963);
  return { name: p.name, primitives: [{ attributes, indices, material: 0 }] };
});
const imageView = addView(new Uint8Array(texPng), undefined);
const byName = Object.fromEntries(parts.map((p, i) => [p.name, { p, i }]));
const body = byName.body.p;
const rel = (p) => p.pivot.map((v, k) => v - body.pivot[k]);
const nodes = [
  { name: 'Sunny', children: [1] },
  { name: 'body', mesh: byName.body.i, translation: body.pivot, children: [2, 3, 4] },
  { name: 'head (neck joint)', mesh: byName.head.i, translation: rel(byName.head.p) },
  { name: 'armL (shoulder joint)', mesh: byName.armL.i, translation: rel(byName.armL.p) },
  { name: 'armR (shoulder joint)', mesh: byName.armR.i, translation: rel(byName.armR.p) },
];
const gltf = {
  asset: { version: '2.0', generator: 'SUN MEDIA sculpt.ts' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes,
  meshes,
  materials: [{ name: 'Sunny', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0.2, roughnessFactor: 0.45 }, alphaMode: 'OPAQUE' }],
  textures: [{ source: 0, sampler: 0 }],
  samplers: [{ magFilter: 9729, minFilter: 9987 }],
  images: [{ bufferView: imageView, mimeType: 'image/png' }],
  accessors,
  bufferViews: views,
  buffers: [{ byteLength: offset }],
};
let json = Buffer.from(JSON.stringify(gltf));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
let bin = Buffer.concat(chunks);
bin = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
const header = Buffer.alloc(12);
header.write('glTF', 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const jsonHead = Buffer.alloc(8);
jsonHead.writeUInt32LE(json.length, 0);
jsonHead.write('JSON', 4);
const binHead = Buffer.alloc(8);
binHead.writeUInt32LE(bin.length, 0);
binHead.write('BIN\0', 4);
writeFileSync(dst, Buffer.concat([header, jsonHead, json, binHead, bin]));
const verts = parts.reduce((n, p) => n + p.positions.length / 3, 0);
const tris = parts.reduce((n, p) => n + p.index.length / 3, 0);
console.log(`wrote ${dst}: ${parts.length} parts, ${verts} vertices, ${tris} triangles, ${(12 + 16 + json.length + bin.length) >> 10} KB`);
