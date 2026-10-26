import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Built once per deployment (static): the worker's code with this deployment's version in it.
export const dynamic = 'force-static';

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';

/** The installed app's service worker (source: lib/pwa/sw-template.js). */
export function GET() {
  const source = readFileSync(join(process.cwd(), 'lib/pwa/sw-template.js'), 'utf8');
  return new Response(`const VERSION = ${JSON.stringify(VERSION)};\n${source}`, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache, max-age=0', 'Service-Worker-Allowed': '/' },
  });
}
