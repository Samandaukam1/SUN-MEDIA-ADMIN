// Runs before `npm run dev`: shows which Supabase the admin will talk to and whether it answers.
// Never blocks the dev server and never prints keys.
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/i;

if (!url || !key) {
  console.warn('[dev-check] NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY topilmadi — .env.development.local ni to‘ldiring (README → Lokal ishga tushirish).');
} else {
  const { hostname, host } = new URL(url);
  const local = LOCAL_HOST.test(hostname);
  let reachable = false;
  if (local) {
    try {
      const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, signal: AbortSignal.timeout(3000) });
      reachable = res.ok;
    } catch {
      reachable = false;
    }
  }
  if (!local) {
    console.warn(`[dev-check] Diqqat: admin lokal bo‘lmagan Supabase’ga ulangan (${host}). Lokal test loginlar (…@sunmedia.local) u yerda yo‘q, DEV QUICK LOGIN ko‘rinmaydi.`);
  } else if (!reachable) {
    console.warn(`[dev-check] Lokal Supabase javob bermayapti (${host}). Avval: npm run db:start (Docker yoqilgan bo‘lsin).`);
  } else {
    console.log(`[dev-check] Supabase: ${host} (lokal) ✓ · Admin: http://localhost:3000/login`);
  }
}
