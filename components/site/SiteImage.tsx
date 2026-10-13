import type { ReactNode } from 'react';

import { SafeImage } from './SafeImage';

/** Images from the site's storage, with a fallback instead of a broken picture. */
export function SiteImage({
  src,
  alt,
  sizes,
  className,
  priority,
  fill = true,
  width,
  height,
  fallback,
}: {
  src: string;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
  fill?: boolean;
  width?: number;
  height?: number;
  fallback?: ReactNode;
}) {
  return <SafeImage src={src} alt={alt} sizes={sizes} className={className} priority={priority} fill={fill} width={width} height={height} fallback={fallback} />;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '·') + (parts[1]?.[0] ?? '')).toUpperCase();
}
