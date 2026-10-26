import type { MetadataRoute } from 'next';

/**
 * The installable app: one Sun Media app for the whole site (every area opens inside it). It starts at /app, which
 * opens the person's own area, or the sign-in when they are not signed in.
 */
export default function manifest(): MetadataRoute.Manifest {
  const shortcut = (name: string, route: string) => ({ name, short_name: name, url: `/open?r=${encodeURIComponent(route)}`, icons: [{ src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png' }] });
  return {
    id: '/app',
    name: 'Sun Media Group',
    short_name: 'Sun Media',
    description: 'SUN MEDIA ichki tizimi: chat, vazifalar, davomat, mijozlar va kontent — bitta ilovada.',
    lang: 'uz',
    dir: 'ltr',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#050506',
    theme_color: '#050506',
    categories: ['business', 'productivity'],
    prefer_related_applications: false,
    icons: [
      { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/pwa/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [shortcut('Chat', '/chat'), shortcut('Vazifalar', '/tasks')],
    // A second launch (or a notification) reuses the open window instead of opening another.
    launch_handler: { client_mode: ['navigate-existing', 'auto'] },
  };
}
