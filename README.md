# SUN MEDIA — Admin panel va backend

Next.js 15 (App Router) + TypeScript. Vercel'ga deploy qilinadi. Supabase backend (migratsiyalar, RLS, testlar, Edge Functions) shu repoda: `supabase/`.

To‘liq arxitektura: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Lokal ishga tushirish

```bash
npm install
npm run db:start      # Docker'da lokal Supabase
npm run db:reset      # migratsiyalar + faqat-lokal seed
npm run dev           # http://localhost:3000
```

`next dev` `.env.development.local` faylini o‘qiydi (Git'ga kirmaydi):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<supabase start: PUBLISHABLE_KEY>
SUPABASE_SECRET_KEY=<supabase start: SECRET_KEY>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Lokal seed hisoblari: `owner@sunmedia.local`, `admin@sunmedia.local` … parol `SunMedia2026!` (faqat lokal).

## Baza

| Buyruq | Vazifa |
|---|---|
| `npm run db:reset` | Lokal bazani qayta qurish (migratsiyalar + seed) |
| `npm run db:test` | pgTAP: RLS izolyatsiyasi va ish oqimlari |
| `npm run db:lint` | PL/pgSQL funksiyalarini tekshirish |
| `npm run db:types` | `types/database.ts` ni generatsiya qilish va mobil ilovaga nusxalash |

Cloud'ga: `npx supabase link --project-ref <ref>` → `npx supabase db push`. Seed cloud'ga **yuborilmaydi**.

## Vercel

Settings → Environment Variables (Production va Preview):

| O‘zgaruvchi | Turi |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (yoki `…_ANON_KEY`) | public |
| `NEXT_PUBLIC_SITE_URL` | public (masalan `https://admin.sunmedia.uz`) |
| `SUPABASE_SECRET_KEY` (yoki `SUPABASE_SERVICE_ROLE_KEY`) | **faqat server** — `NEXT_PUBLIC_` prefiksisiz |

Supabase → Auth → URL Configuration: Site URL = admin domeni; Redirect URLs ga `https://<admin-domen>/auth/callback`, `sunmedia://auth/callback`, `sunmedia://reset-password` qo‘shing.
