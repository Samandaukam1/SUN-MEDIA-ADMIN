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

Lokal seed hisoblari (parol hammasida `SunMedia2026!`, faqat lokal):

| Rol | Login |
|---|---|
| Owner | `owner@sunmedia.local` |
| Admin | `admin@sunmedia.local` |
| Project Manager | `manager@sunmedia.local`, `pm@sunmedia.local` |
| SMM | `smm@sunmedia.local` |
| Operator | `operator@sunmedia.local` |
| Montajyor | `editor@sunmedia.local` |
| Dizayner | `designer@sunmedia.local` |
| Kopirayter | `copywriter@sunmedia.local` |
| Mijoz egasi (SAFI) | `safi@client.local` |
| Mijoz xodimi (SAFI) | `safi.employee@client.local` |
| Mijoz egasi (WeDrink) | `wedrink@client.local` |

## Akkaunt yaratish (Team → Xodim qo‘shish, Mijoz → Loginlar)

1. Server action chaqiruvchining sessiyasini tekshiradi.
2. Faqat Auth login `auth.admin.createUser` bilan **server**da yaratiladi (service role faqat `lib/accounts.ts` ichida, `server-only`).
3. Rol, xodim yozuvi, mijoz jamoasi va ruxsatlarni `provision_staff_member` / `provision_client_user` RPC'lari **admin'ning o‘z sessiyasi** bilan yozadi: permission, rang (o‘zidan yuqori rol berib bo‘lmaydi), mijoz doirasi va “faqat yangi login” tekshiruvlari bazada. Xato bo‘lsa login o‘chiriladi.
4. Vaqtinchalik parol (`X9fa-K82p!` ko‘rinishi, CSPRNG) faqat bir marta ko‘rsatiladi va hech qayerda saqlanmaydi. “Parolni tiklash” yangi parol beradi (`authorize_password_reset` + audit).
5. Holat: Faol / To‘xtatilgan / O‘chirilgan (`set_account_status`). Bloklanganda RLS darhol yopiladi va Auth ban ochiq sessiyalarni tugatadi.

Barcha amallar `audit_logs`ga yoziladi (`account.created`, `account.password_reset`, `account.status_changed`).

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
