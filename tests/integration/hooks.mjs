// Lets `node --test` load the app's TypeScript modules as they are: the "@/…" alias, extensionless relative imports,
// and Next-only modules ("server-only", "next/cache", "next/headers") replaced by no-ops outside Next.
import { statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const STUBS = {
  'server-only': 'export {};',
  'next/cache': 'export const revalidatePath = () => {}; export const revalidateTag = () => {}; export const unstable_cache = (fn) => fn;',
  'next/headers': 'export const cookies = async () => ({ getAll: () => [], set() {} }); export const headers = async () => new Headers();',
};
const file = (base) => ['', '.ts', '.tsx', '/index.ts'].map((ext) => base + ext).find((p) => statSync(p, { throwIfNoEntry: false })?.isFile());

registerHooks({
  resolve(specifier, context, next) {
    if (STUBS[specifier] !== undefined) return { url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`, shortCircuit: true };
    if (specifier.startsWith('@/')) {
      const hit = file(ROOT + specifier.slice(2));
      if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
    }
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      const hit = file(fileURLToPath(new URL(specifier, context.parentURL)));
      if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
