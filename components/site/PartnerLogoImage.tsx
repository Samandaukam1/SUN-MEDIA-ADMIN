'use client';

import Image from 'next/image';
import { useState, type ReactNode } from 'react';

import { logoNeedsLightPlate } from '@/lib/site/logo-look';

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
  return logoNeedsLightPlate(ctx.getImageData(0, 0, n, n).data, n);
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
