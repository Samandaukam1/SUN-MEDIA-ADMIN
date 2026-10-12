import Image from 'next/image';

/** Images from the site's storage; SVG logos skip the optimiser (it does not rasterise SVG). */
export function SiteImage({
  src,
  alt,
  sizes,
  className,
  priority,
  fill = true,
  width,
  height,
}: {
  src: string;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
  fill?: boolean;
  width?: number;
  height?: number;
}) {
  const svg = /\.svg(\?|$)/i.test(src);
  return fill ? (
    <Image src={src} alt={alt} fill sizes={sizes ?? '100vw'} className={className} priority={priority} unoptimized={svg} />
  ) : (
    <Image src={src} alt={alt} width={width ?? 400} height={height ?? 200} sizes={sizes} className={className} priority={priority} unoptimized={svg} />
  );
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '·') + (parts[1]?.[0] ?? '')).toUpperCase();
}
