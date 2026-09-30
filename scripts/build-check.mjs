// Runs before `npm run build`. On a production deploy (Vercel production, or CI with STRICT_ENV=1) a missing or
// misplaced setting fails the build instead of shipping a panel that breaks at the first request.
// Elsewhere it only warns. Never prints values.
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd(), false, { info: () => {}, error: () => {} });

const strict = process.env.VERCEL_ENV === 'production' || process.env.STRICT_ENV === '1';
const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/i;
const problems = [];
const leaks = [];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);

function host(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

/** True for keys that must stay on the server: sb_secret_… or a JWT whose role is service_role. */
function isSecretKey(value) {
  if (!value) return false;
  if (value.startsWith('sb_secret_')) return true;
  try {
    const payload = JSON.parse(Buffer.from(value.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

if (!host(url)) problems.push('NEXT_PUBLIC_SUPABASE_URL yo‘q yoki noto‘g‘ri.');
else if (LOCAL_HOST.test(host(url))) problems.push('NEXT_PUBLIC_SUPABASE_URL lokal manzilga ishora qilyapti — production cloud Supabase URL kerak.');
if (!publicKey || publicKey.length < 20) problems.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (yoki ANON_KEY) yo‘q.');
if (!secretKey || secretKey.length < 20) problems.push('SUPABASE_SECRET_KEY (yoki SUPABASE_SERVICE_ROLE_KEY) server env’da yo‘q.');
if (!host(siteUrl)) problems.push('NEXT_PUBLIC_SITE_URL yo‘q (Vercel’da VERCEL_PROJECT_PRODUCTION_URL ham bo‘lmadi).');
else if (LOCAL_HOST.test(host(siteUrl))) problems.push('NEXT_PUBLIC_SITE_URL lokal manzil — production domenini kiriting.');

// A server secret under a NEXT_PUBLIC_ name would be inlined into the browser bundle.
for (const [name, value] of Object.entries(process.env)) {
  if (name.startsWith('NEXT_PUBLIC_') && isSecretKey(value)) leaks.push(name);
}
if (leaks.length) {
  // Always fatal: this would publish the key, whatever the environment.
  console.error(`[build-check] Server kaliti NEXT_PUBLIC_ nomi ostida: ${leaks.join(', ')}. Build to‘xtatildi.`);
  process.exit(1);
}

if (problems.length) {
  const out = strict ? console.error : console.warn;
  out(`[build-check] ${strict ? 'Production build to‘xtatildi' : 'Ogohlantirish'}:\n - ${problems.join('\n - ')}`);
  if (strict) process.exit(1);
} else {
  console.log(`[build-check] env ✓ (Supabase: ${host(url)}, sayt: ${host(siteUrl)})`);
}
