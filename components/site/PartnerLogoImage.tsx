'use client';

import Image from 'next/image';
import { useState, type ReactNode } from 'react';

/**
 * A partner logo in its own colours on the dark site. A logo that is dark and has a transparent background
 * would vanish on black, so it gets a light plate behind it; every other logo stays as it is.
 * A file that fails to load shows the fallback (the partner's name) instead of a broken picture.
 */
function needsPlate(img: HTMLImageElement): boolean {
  const n = 40;
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, n, n);
  const data = ctx.getImageData(0, 0, n, n).data;
  let clearEdge = 0;
  let edge = 0;
  let value = 0;
  let weight = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const a = data[i + 3] / 255;
      if (x === 0 || y === 0 || x === n - 1 || y === n - 1) {
        edge++;
        if (a < 0.6) clearEdge++;
      }
      value += (Math.max(data[i], data[i + 1], data[i + 2]) / 255) * a;
      weight += a;
    }
  }
  const transparent = clearEdge / edge > 0.5;
  return transparent && weight > 0 && value / weight < 0.45;
}

/**
 * `muted`: on a computer with a mouse the logo rests in grey and turns to colour when the card is hovered or
 * focused; phones and touch screens (no hover) always show colour.
 */
export function PartnerLogoImage({ src, alt, sizes, fallback, muted = false }: { src: string; alt: string; sizes: string; fallback: ReactNode; muted?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [plate, setPlate] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <>
      {plate ? <span aria-hidden className="absolute -inset-x-3 -inset-y-1.5 rounded-2xl bg-[#ececef] shadow-[inset_0_1px_0_rgb(255_255_255/0.9)]" /> : null}
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className={`object-contain opacity-95 transition-[filter,opacity] duration-500 group-hover:opacity-100 ${
          muted ? '[@media(hover:hover)_and_(pointer:fine)]:grayscale group-hover:grayscale-0 group-focus-visible:grayscale-0' : ''
        }`}
        onError={() => setFailed(true)}
        onLoad={(e) => {
          try {
            setPlate(needsPlate(e.currentTarget));
          } catch {
            setPlate(false);
          }
        }}
      />
    </>
  );
}
