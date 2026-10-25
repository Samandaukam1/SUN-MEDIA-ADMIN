import * as THREE from 'three';

import { logoNeedsLightPlate } from '@/lib/site/logo-look';

/*
 * A partner logo turned into the label that sits on the inner wall of its bubble. The logo keeps its
 * proportions and colours (contain, never cropped or stretched):
 *  - transparent logos float on their own; dark ones get a soft light disc so they read on the black scene;
 *  - logos with their own background become a rounded card in that background colour;
 *  - an image that fails to load shows the partner's name instead of a broken picture.
 */

const SIZE = 512;
const DISC = 240;

function loadImage(url: string, timeoutMs = 15000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      if (img.naturalWidth > 0 && img.naturalHeight > 0) resolve(img);
      else reject(new Error('empty image'));
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('load failed'));
    };
    img.src = url;
  });
}

type Look = { transparent: boolean; needsPlate: boolean; corner: string };

/** Samples a thumbnail: does the image have a transparent border, would it vanish on black, which colour is its corner. */
function inspect(img: HTMLImageElement): Look {
  const n = 48;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, n, n);
  const data = ctx.getImageData(0, 0, n, n).data;
  let edgeClear = 0;
  let edgeCount = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (x === 0 || y === 0 || x === n - 1 || y === n - 1) {
        edgeCount++;
        if (data[(y * n + x) * 4 + 3] / 255 < 0.6) edgeClear++;
      }
    }
  }
  const corner = `rgb(${data[0]}, ${data[1]}, ${data[2]})`;
  return { transparent: edgeClear / edgeCount > 0.5, needsPlate: logoNeedsLightPlate(data, n), corner };
}

function contain(w: number, h: number, box: number) {
  const k = Math.min(box / w, box / h);
  return { w: w * k, h: h * k };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function lightDisc(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(SIZE / 2 - 40, SIZE / 2 - 60, 20, SIZE / 2, SIZE / 2, DISC);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#e4e4e7');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, DISC, 0, Math.PI * 2);
  ctx.fill();
}

function draw(img: HTMLImageElement | null, name: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';

  if (!img) {
    lightDisc(ctx);
    ctx.fillStyle = '#0b0b0c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 78;
    const font = (s: number) => `600 ${s}px Inter, "Helvetica Neue", Arial, sans-serif`;
    ctx.font = font(size);
    while (size > 28 && ctx.measureText(name).width > DISC * 1.6) ctx.font = font((size -= 4));
    ctx.fillText(name, SIZE / 2, SIZE / 2, DISC * 1.7);
    return canvas;
  }

  const look = inspect(img);
  if (look.transparent) {
    if (look.needsPlate) lightDisc(ctx);
    const { w, h } = contain(img.naturalWidth, img.naturalHeight, DISC * 1.46);
    ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  } else {
    // Its own background: a rounded card in the corner colour with the whole image inside (nothing cut off).
    const { w, h } = contain(img.naturalWidth, img.naturalHeight, DISC * 1.4);
    const pad = Math.max(14, Math.min(w, h) * 0.08);
    const cw = w + pad * 2;
    const ch = h + pad * 2;
    ctx.fillStyle = look.corner;
    roundedRect(ctx, (SIZE - cw) / 2, (SIZE - ch) / 2, cw, ch, Math.min(cw, ch) * 0.18);
    ctx.fill();
    ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  }
  return canvas;
}

/**
 * The logo through the site's image optimizer at 640 px — more than the ≤ 350 px it is drawn at, a fraction of the
 * uploaded file, and the same URL next/image uses for the partner strip, so it is usually in the cache already.
 */
const optimized = (url: string) => `/_next/image?url=${encodeURIComponent(url)}&w=640&q=75`;

export async function loadLogoLabel(url: string, name: string): Promise<THREE.CanvasTexture> {
  let img: HTMLImageElement | null = null;
  try {
    img = await loadImage(optimized(url));
  } catch {
    // A logo the optimizer does not serve (another host): the original file.
    try {
      img = await loadImage(url);
    } catch {
      img = null;
    }
  }
  let canvas: HTMLCanvasElement;
  try {
    canvas = draw(img, name);
  } catch {
    // A tainted or unreadable image: fall back to the name.
    canvas = draw(null, name);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // The label is seen from inside the sphere (its back wall), so u runs right-to-left: mirror it back.
  texture.repeat.set(-1, 1);
  texture.offset.set(1, 0);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}
