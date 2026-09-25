import { cn } from './cn';

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '·') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function Avatar({ name, url, size = 36, className }: { name?: string | null; url?: string | null; size?: number; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- avatars come from signed storage URLs of any size
    return <img src={url} alt="" width={size} height={size} className={cn('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />;
  }
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent-on-soft', className)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
