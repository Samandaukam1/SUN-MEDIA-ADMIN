# SUN MEDIA — xavfsizlik modeli

Oxirgi audit: 2026-09-26 (Phase 16). Qoidalar `supabase/tests/database/016_security_invariants.test.sql` bilan har test yurganda tekshiriladi.

## Asosiy tamoyillar

| Qatlam | Qoida |
|---|---|
| Ma’lumot | Har bir `public` jadvalda RLS yoqilgan. Mijoz faqat o‘z kompaniyasini, xodim faqat o‘z mijozlari / vazifalarini ko‘radi. |
| Funksiyalar | `SECURITY DEFINER` funksiyalar `search_path = ''` bilan, ichida chaqiruvchini tekshiradi (`auth.uid()`, `has_permission`, `can_manage_client`…). |
| Anonim | `anon` hech qanday jadval yoki funksiyaga kira olmaydi. |
| `private` sxema | API orqali ochilmaydi (`[api] schemas = public, graphql_public`), app foydalanuvchilarida grant yo‘q. |
| Ko‘rinishlar | Barcha view’lar `security_invoker = true` — chaqiruvchining RLS’i bilan ishlaydi. |
| Storage | Faqat `avatars` ochiq. Fayllar, chat va hisobot PDF’lari — yopiq; kirish `files` / `monthly_reports` RLS’iga tayanadi, havolalar qisqa muddatli (signed URL). |
| Realtime | Kanallar private; ma’lumot jadvallari faqat “o‘zgardi” signalini yuboradi, ilova ma’lumotni RLS orqali qayta so‘raydi. Chat xabarlari faqat xona a’zolariga. |
| Kalitlar | `service_role` / `sb_secret_` faqat admin serverida (`lib/env.server.ts`, `lib/supabase/admin.ts`, `lib/accounts.ts` — `server-only`). Mobil ilovada faqat public kalit. |
| Push navbati | `claim_push_deliveries` / `complete_push_deliveries` faqat `service_role` (Edge Function) uchun. |
| Admin server actions | Har biri `requireStaff()` yoki `requirePermission()` bilan boshlanadi; yozuvlar foydalanuvchi sessiyasi bilan (RLS ishlaydi). |
| HTTP | CSP (`frame-ancestors 'none'`, `object-src 'none'`, `connect-src` faqat Supabase), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, production’da HSTS. |

## Audit natijasi (2026-09-26)

- RLS’siz jadval: **0**
- `search_path`’siz definer funksiya: **0**
- `anon` bajaradigan funksiya / jadval: **0 / 0**
- Chaqiruvchini tekshirmaydigan, foydalanuvchiga ochiq definer funksiya: **0**
- PL/pgSQL lint (`supabase db lint --level warning`): **0** ogohlantirish (2 ta tuzatildi: `clean_shot_list` IMMUTABLE → STABLE, turlar aniqlashtirildi)
- Admin sahifalar CSP bilan: xatosiz (Playwright smoke)
- Hisobot PDF yuklash: Storage read policy tuzatildi (menejer o‘z mijozi papkasini o‘qiy oladi)

## Production uchun eslatma

- `SUPABASE_SECRET_KEY` faqat Vercel’ning server env’ida, `NEXT_PUBLIC_` prefiksisiz.
- Push: `PUSH_DISPATCH_SECRET` Supabase secrets’da va vault’da bir xil bo‘lishi kerak (README → Push).
- Seed (`seed.sql`) cloud’ga yuborilmaydi; test parollari faqat lokal.
