const STRIPES: Array<[number, number]> = [
  [56, 4.5],
  [69, 4],
  [80.5, 3.4],
  [90.3, 2.9],
];

/** Placeholder SUN MEDIA mark until the official logo files are supplied (same geometry as the app icon). */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="SUN MEDIA">
      <defs>
        <mask id="sunmedia-horizon">
          <rect width="100" height="100" fill="white" />
          {STRIPES.map(([y, h]) => (
            <rect key={y} x="0" y={y} width="100" height={h} fill="black" />
          ))}
        </mask>
      </defs>
      <circle cx="50" cy="50" r="50" fill="#F5A524" mask="url(#sunmedia-horizon)" />
    </svg>
  );
}

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className ?? ''}`}>
      <LogoMark size={size} />
      <span className="font-bold tracking-[0.3em]" style={{ fontSize: size * 0.46 }}>
        SUN MEDIA
      </span>
    </span>
  );
}
