/**
 * Sunny's 3D body, reconstructed from the original picture (public/assistant/robot.webp, 1254×1254 frame, the same as
 * the master render). Pure maths, no three.js: works in the browser (alpha read from the image) and in Node (tests,
 * GLB export).
 *
 * Each part (head, body, the two arms) is the picture's own silhouette inflated into a closed volume: depth grows from
 * the outline inward with a rounded profile (a TV-like slab for the head, an egg for the body, tubes for the arms), a
 * front and a back surface that meet in one shared ring at the outline. Every front vertex keeps the picture pixel it
 * came from as its UV, so seen from the front at rest the model is the picture, pixel for pixel; sides and back are the
 * same silver, with no invented details. Parts pivot at their real joints (neck, shoulders), in the picture's pose.
 */

export const FRAME = 1254;

export type PartName = 'head' | 'body' | 'armL' | 'armR';
type Poly = [number, number][];
type Spec = {
  name: PartName;
  /** Where this part is in the picture (image px). The head, body and arms do not overlap; the alpha cuts the outline. */
  region: Poly;
  /** Geometry hidden behind other parts in the picture (under the head, behind the shoulders): built, never textured. */
  hidden?: Poly[];
  /** Rounded-edge radius and depth toward the viewer / away from them, image px. */
  r: number;
  front: number;
  back: number;
  /** Depth offset of the whole part, image px (+ toward the viewer). */
  z: number;
  /** Joint, image px (the part turns about it). */
  pivot: [number, number, number];
};

/** Traced on the 1254 frame of the master picture (see the zoomed joint crops in the commit that added this). */
export const PARTS: Spec[] = [
  {
    // The raised arm pointing at the visitor: the silver shoulder ball and the hand. The lime-rimmed socket around the
    // ball belongs to the body (it stays when the arm moves); the line follows the ball's edge against it.
    name: 'armL',
    region: [
      [176, 600],
      [260, 556],
      [380, 556],
      [405, 582],
      [428, 600],
      [442, 630],
      [447, 670],
      [444, 710],
      [436, 740],
      [424, 762],
      [418, 780],
      [412, 800],
      [406, 822],
      [404, 872],
      [300, 894],
      [196, 882],
      [172, 800],
      [174, 700],
    ],
    r: 95,
    front: 95,
    back: 95,
    z: 10,
    // The ball turns in its socket: the arm swings about the ball's centre.
    pivot: [368, 688, 10],
  },
  {
    // The arm hanging on the right, from the crease beside the body down to the hand.
    name: 'armR',
    region: [
      [862, 636],
      [910, 638],
      [930, 700],
      [962, 768],
      [1012, 828],
      [1040, 900],
      [1040, 1145],
      [858, 1145],
      [846, 1050],
      [843, 960],
      [846, 880],
      [864, 800],
      [878, 700],
    ],
    r: 80,
    front: 80,
    back: 80,
    z: -20,
    pivot: [884, 690, -40],
  },
  {
    // Everything above the dark line between head and shoulders.
    name: 'head',
    region: [
      [180, 20],
      [1080, 20],
      [1080, 616],
      [1000, 612],
      [900, 603],
      [800, 594],
      [700, 585],
      [600, 575],
      [500, 566],
      [400, 557],
      [300, 548],
      [180, 538],
    ],
    r: 150,
    front: 150,
    back: 240,
    z: 0,
    pivot: [690, 592, -40],
  },
  {
    // The rest of the silhouette; continued under the head and behind both shoulders so nothing opens when they move.
    name: 'body',
    region: [
      [380, 520],
      [1000, 520],
      [1000, 1200],
      [380, 1200],
    ],
    hidden: [
      [
        [462, 548],
        [700, 560],
        [880, 578],
        [900, 640],
        [860, 664],
        [480, 624],
        [452, 586],
      ],
      [
        // Behind the shoulder ball, inside the socket.
        [356, 590],
        [446, 572],
        [454, 700],
        [442, 772],
        [410, 804],
        [378, 760],
        [356, 680],
      ],
      [
        [848, 630],
        [902, 640],
        [896, 900],
        [846, 900],
      ],
    ],
    r: 230,
    front: 200,
    back: 210,
    z: -60,
    pivot: [660, 860, -60],
  },
];

export type Sculpted = {
  name: PartName;
  /** Joint position, world units (the geometry below is relative to it). */
  pivot: [number, number, number];
  positions: Float32Array;
  normals: Float32Array;
  /** Picture coordinates (0–1, v up) for every vertex. */
  uvs: Float32Array;
  /** How much of the picture shows on this vertex: 1 on the visible front, 0 on sides, back and hidden parts. */
  front: Float32Array;
  index: Uint32Array;
  /** The front surface's depth grid (plain data, so a worker can hand it over), for `depthAt`. */
  depth: { u0: number; v0: number; nx: number; ny: number; step: number; scale: number; pz: number; zf: Float32Array };
};

/** Front-surface depth (world, relative to the part's joint) at a picture pixel: where the face lies on the visor. */
export function depthAt({ depth: g }: Sculpted, u: number, v: number): number {
  const fi = (u - g.u0) / g.step;
  const fj = (v - g.v0) / g.step;
  const i = Math.max(0, Math.min(g.nx - 2, Math.floor(fi)));
  const j = Math.max(0, Math.min(g.ny - 2, Math.floor(fj)));
  const s = fi - i;
  const t = fj - j;
  const z = (ii: number, jj: number) => g.zf[jj * g.nx + ii];
  const zz = (1 - s) * (1 - t) * z(i, j) + s * (1 - t) * z(i + 1, j) + (1 - s) * t * z(i, j + 1) + s * t * z(i + 1, j + 1);
  return zz * g.scale - g.pz;
}

function inside(poly: Poly, x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Rounded profile: 0 at the outline, 1 from `r` inward (a quarter circle). */
const profile = (d: number, r: number) => {
  const t = Math.min(1, d / r);
  return Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
};

/**
 * @param alpha picture alpha, `size`×`size` covering the whole frame
 * @param scale world units per picture pixel
 * @param center picture point placed at the world origin
 * @param step grid step, picture pixels (smaller = finer mesh)
 */
export function sculpt(alpha: ArrayLike<number>, size: number, { scale, center, step = 7 }: { scale: number; center: [number, number]; step?: number }): Sculpted[] {
  /** Alpha at a picture point, bilinear (so outlines land between pixels, not on the grid). */
  const alphaAt = (u: number, v: number) => {
    const x = Math.min(size - 1.001, Math.max(0, (u / FRAME) * size - 0.5));
    const y = Math.min(size - 1.001, Math.max(0, (v / FRAME) * size - 0.5));
    const i = Math.floor(x);
    const j = Math.floor(y);
    const s = x - i;
    const t = y - j;
    const a = (ii: number, jj: number) => alpha[jj * size + ii];
    return (1 - s) * (1 - t) * a(i, j) + s * (1 - t) * a(i + 1, j) + (1 - s) * t * a(i, j + 1) + s * t * a(i + 1, j + 1);
  };
  const at = (u: number, v: number) => alphaAt(u, v) > 127;
  const owner = (u: number, v: number): PartName | null => {
    if (!at(u, v)) return null;
    for (const p of PARTS) if (p.name !== 'body' && inside(p.region, u, v)) return p.name;
    return inside(PARTS[3].region, u, v) ? 'body' : null;
  };
  const [cx, cy] = center;
  const world = (u: number, v: number, z: number): [number, number, number] => [(u - cx) * scale, (cy - v) * scale, z * scale];

  return PARTS.map((spec) => {
    const xs = spec.region.map((p) => p[0]).concat(...(spec.hidden ?? []).map((h) => h.map((p) => p[0])));
    const ys = spec.region.map((p) => p[1]).concat(...(spec.hidden ?? []).map((h) => h.map((p) => p[1])));
    const u0 = Math.max(0, Math.min(...xs) - step);
    const v0 = Math.max(0, Math.min(...ys) - step);
    const nx = Math.ceil((Math.min(FRAME, Math.max(...xs) + step) - u0) / step) + 1;
    const ny = Math.ceil((Math.min(FRAME, Math.max(...ys) + step) - v0) / step) + 1;
    const N = nx * ny;
    const tex = new Uint8Array(N);
    const geo = new Uint8Array(N);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const u = u0 + i * step;
        const v = v0 + j * step;
        const k = j * nx + i;
        tex[k] = owner(u, v) === spec.name ? 1 : 0;
        // Hidden geometry only where another part covers it in the picture: it never widens the silhouette.
        geo[k] = tex[k] || (at(u, v) && (spec.hidden ?? []).some((h) => inside(h, u, v))) ? 1 : 0;
      }

    // Distance to the outline (chamfer 3-4, two passes), in picture pixels: of the whole volume (for the back and the
    // hidden parts) and of the visible area alone (for the front, so each part slopes down where a neighbour takes over,
    // as in the picture).
    const distance = (mask: Uint8Array) => {
      const out = new Float32Array(N);
      for (let k = 0; k < N; k++) out[k] = mask[k] ? 1e9 : 0;
      const relax = (k: number, n: number, w: number) => {
        if (out[n] + w < out[k]) out[k] = out[n] + w;
      };
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          if (!mask[k]) continue;
          if (i === 0 || j === 0) out[k] = 0;
          else {
            relax(k, k - 1, 3);
            relax(k, k - nx, 3);
            relax(k, k - nx - 1, 4);
            if (i < nx - 1) relax(k, k - nx + 1, 4);
          }
        }
      for (let j = ny - 1; j >= 0; j--)
        for (let i = nx - 1; i >= 0; i--) {
          const k = j * nx + i;
          if (!mask[k]) continue;
          if (i === nx - 1 || j === ny - 1) out[k] = 0;
          else {
            relax(k, k + 1, 3);
            relax(k, k + nx, 3);
            relax(k, k + nx + 1, 4);
            if (i > 0) relax(k, k + nx - 1, 4);
          }
        }
      for (let k = 0; k < N; k++) out[k] = (out[k] / 3) * step;
      return out;
    };
    const d = distance(geo);
    const dSeen = distance(tex);

    // Boundary points (an outside 4-neighbour) are shared by the front and back surfaces: the mesh closes there.
    const boundary = new Uint8Array(N);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!geo[k]) continue;
        boundary[k] = i === 0 || j === 0 || i === nx - 1 || j === ny - 1 || !geo[k - 1] || !geo[k + 1] || !geo[k - nx] || !geo[k + nx] ? 1 : 0;
      }
    const zf = new Float32Array(N);
    const zb = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      if (!geo[k]) continue;
      const p = boundary[k] ? 0 : profile(d[k], spec.r);
      // Hidden parts sit well behind whatever covers them in the picture (never level with it: no flicker).
      zf[k] = tex[k] ? spec.z + spec.front * (boundary[k] ? 0 : profile(dSeen[k], spec.r)) : spec.z - 40 * p;
      zb[k] = spec.z - spec.back * p;
    }

    // Smooth both surfaces (the chamfer distance has small steps that a metallic reflection would magnify into ripples);
    // the outline stays where it is.
    const relaxSurface = (z: Float32Array) => {
      const tmp = new Float32Array(N);
      for (let pass = 0; pass < 4; pass++) {
        tmp.set(z);
        for (let j = 1; j < ny - 1; j++)
          for (let i = 1; i < nx - 1; i++) {
            const k = j * nx + i;
            if (!geo[k] || boundary[k]) continue;
            let sum = 0;
            let n = 0;
            for (const o of [k - 1, k + 1, k - nx, k + nx, k - nx - 1, k - nx + 1, k + nx - 1, k + nx + 1]) {
              if (!geo[o]) continue;
              sum += tmp[o];
              n++;
            }
            z[k] = (tmp[k] * 2 + sum) / (n + 2);
          }
      }
    };
    relaxSurface(zf);
    relaxSurface(zb);

    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const fr: number[] = [];
    const idx: number[] = [];
    const front = new Int32Array(N).fill(-1);
    const back = new Int32Array(N).fill(-1);
    const [px, py, pz] = world(spec.pivot[0], spec.pivot[1], spec.pivot[2]);
    const grad = (z: Float32Array, i: number, j: number) => {
      const k = j * nx + i;
      const zl = i > 0 && geo[k - 1] ? z[k - 1] : z[k];
      const zr = i < nx - 1 && geo[k + 1] ? z[k + 1] : z[k];
      const zu = j > 0 && geo[k - nx] ? z[k - nx] : z[k];
      const zd = j < ny - 1 && geo[k + nx] ? z[k + nx] : z[k];
      // d/du and d/dv in picture px; world y runs against v.
      return [(zr - zl) / (2 * step), -(zd - zu) / (2 * step)];
    };
    const push = (u: number, v: number, z: number, n: [number, number, number], w: number) => {
      const [x, y, zz] = world(u, v, z);
      pos.push(x - px, y - py, zz - pz);
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      nor.push(n[0] / l, n[1] / l, n[2] / l);
      uv.push(u / FRAME, 1 - v / FRAME);
      fr.push(w);
      return pos.length / 3 - 1;
    };
    const mine = (u: number, v: number) => owner(u, v) === spec.name || (at(u, v) && (spec.hidden ?? []).some((h) => inside(h, u, v)));
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!geo[k]) continue;
        let u = u0 + i * step;
        let v = v0 + j * step;
        if (boundary[k]) {
          // Outward, in the picture plane: down the distance field. The point slides out to the real outline (where the
          // picture's alpha or this part's region ends), so the silhouette is smooth instead of following the grid.
          const gx = (i < nx - 1 ? d[k + 1] : 0) - (i > 0 ? d[k - 1] : 0);
          const gy = (j < ny - 1 ? d[k + nx] : 0) - (j > 0 ? d[k - nx] : 0);
          const l = Math.hypot(gx, gy);
          if (l > 0) {
            const ox = -gx / l;
            const oy = -gy / l;
            // Up to the picture's outline; across a line between two parts, one grid step further, so neighbouring
            // parts overlap a little (they paint the same picture pixels there) and no hairline gap opens between them.
            let reach = 0;
            let left = -1;
            for (let t = 0.5; t <= step * 2; t += 0.5) {
              const x = u + ox * t;
              const y = v + oy * t;
              if (!at(x, y)) break;
              if (!mine(x, y)) {
                if (left < 0) left = t;
                if (t - left > step) break;
              } else if (left >= 0) left = -1;
              reach = t;
            }
            u += ox * reach;
            v += oy * reach;
          }
          // Two vertices in the same place: the front one carries the picture to the very edge, the back one does not.
          const n: [number, number, number] = [l > 0 ? -gx / l : 0.0001, l > 0 ? gy / l : 0, 0];
          front[k] = push(u, v, spec.z, n, tex[k] ? 1 : 0);
          back[k] = push(u, v, spec.z, n, 0);
          continue;
        }
        const [fx, fy] = grad(zf, i, j);
        const nf: [number, number, number] = [-fx, -fy, 1];
        front[k] = push(u, v, zf[k], nf, tex[k]);
        const [bx, by] = grad(zb, i, j);
        back[k] = push(u, v, zb[k], [bx, by, -1], 0);
      }
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const c = a + nx + 1;
        const dd = a + nx;
        const n = geo[a] + geo[b] + geo[c] + geo[dd];
        if (n < 3) continue;
        // Counter-clockwise seen from the viewer (world y up = picture v down): a → d → c → b.
        if (n === 4) {
          idx.push(front[a], front[dd], front[c], front[a], front[c], front[b]);
          idx.push(back[a], back[c], back[dd], back[a], back[b], back[c]);
          continue;
        }
        // A corner cell on the outline: one triangle of the three inside corners, so the edge has no steps.
        const ring = [a, dd, c, b].filter((x) => geo[x]);
        idx.push(front[ring[0]], front[ring[1]], front[ring[2]]);
        idx.push(back[ring[0]], back[ring[2]], back[ring[1]]);
      }

    return {
      name: spec.name,
      pivot: [px, py, pz],
      positions: new Float32Array(pos),
      normals: new Float32Array(nor),
      uvs: new Float32Array(uv),
      front: new Float32Array(fr),
      index: new Uint32Array(idx),
      depth: { u0, v0, nx, ny, step, scale, pz, zf },
    };
  });
}
