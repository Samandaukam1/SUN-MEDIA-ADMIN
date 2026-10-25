import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

// Supabase is the only other origin the panel talks to (REST, Auth, Storage, Realtime).
const supabase = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
  } catch {
    return '';
  }
})();
const supabaseWs = supabase.replace(/^http/, 'ws');

// Site images (partner logos, case covers) live in Supabase Storage and go through next/image.
const storagePattern = (() => {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    return [{ protocol: u.protocol.replace(':', '') as 'http' | 'https', hostname: u.hostname, port: u.port, pathname: '/storage/v1/object/public/**' }];
  } catch {
    return [];
  }
})();

// Next.js injects inline bootstrap scripts, so 'unsafe-inline' stays for scripts; the policy still
// blocks framing, plugins, foreign form targets and connections to anything but Supabase.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `img-src 'self' data: blob: ${supabase}`.trim(),
  `connect-src 'self' ${supabase} ${supabaseWs}${isDev ? ' ws: http://localhost:*' : ''}`.trim(),
  `media-src 'self' blob: ${supabase}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=()' },
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep the dev-only indicator away from the sidebar's account controls.
  devIndicators: { position: 'bottom-right' },
  poweredByHeader: false,
  // Logo uploads (≤ 2 MB) go through a server action.
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
  images: { remotePatterns: storagePattern, formats: ['image/avif', 'image/webp'] },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
