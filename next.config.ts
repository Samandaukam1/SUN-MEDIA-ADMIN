import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep the dev-only indicator away from the sidebar's account controls.
  devIndicators: { position: 'bottom-right' },
  poweredByHeader: false,
};

export default nextConfig;
