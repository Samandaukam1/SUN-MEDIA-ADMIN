'use client';

import Image from 'next/image';
import { useState, type ReactNode } from 'react';

/**
 * next/image that never shows a broken-image icon: if the file is missing or slow to fail, the fallback
 * (a name, initials or a neutral surface) takes its place.
 */
export function SafeImage({
  src,
  alt,
  sizes,
  className,
  priority,
  fill,
  width,
  height,
  fallback,
}: {
  src: string;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
  fill: boolean;
  width?: number;
  height?: number;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback ?? <span aria-hidden className="absolute inset-0 bg-white/[0.03]" />}</>;
  const svg = /\.svg(\?|$)/i.test(src);
  return fill ? (
    <Image src={src} alt={alt} fill sizes={sizes ?? '100vw'} className={className} priority={priority} unoptimized={svg} onError={() => setFailed(true)} />
  ) : (
    <Image src={src} alt={alt} width={width ?? 400} height={height ?? 200} sizes={sizes} className={className} priority={priority} unoptimized={svg} onError={() => setFailed(true)} />
  );
}
