# Tezlik optimizatsiyasi (2026-10-25, branch `perf/optimization`)

Dizayn, funksiyalar va ma'lumotlar o'zgarmagan. Hech narsa production'ga chiqarilmagan. O'lchovlar lokal izolyatsiyalangan
bazada (`SUNMEDIA_PERF`, ~1 yillik sintetik hajm: 94k xabar, 360k o'qilganlik, 15k vazifa, 20k lid) va Lighthouse bilan.

## Topilgan sabablar

| # | Muammo | Dalil |
|---|---|---|
| 1 | Vercel funksiyalari `iad1` (AQSh), Supabase `ap-southeast-2` (Sidney) | Har bir server so'rovi ~200 ms; panel sahifasi 2–3 bosqich → ~480 ms faqat kutish |
| 2 | `get_crm_summary()` har bir lid uchun `sees_all_clients()` / `staff_client_ids()` ni chaqiradi | 20k lidda 5.5 s; cheklangan xodimda 8 s timeout → 500 |
| 3 | `private.my_chat_room_ids()` har a'zolik qatori uchun helper'larni chaqiradi; chat RLS'ida bir so'rovda 5–6 marta | `get_my_chats` (har panel sahifasida) ~300 ms |
| 4 | `get_client_leads()` "bugun/7/30 kun" chegarasini har qator uchun qayta hisoblaydi | ~57 ms |
| 5 | PageSpeed: GPU'siz mashinada (PSI shunday) 3D sahna dasturiy chiziladi | TBT 105 s, main-thread 235 s |
| 6 | Butun sayt kontenti `opacity:0` bilan keladi va JS yuklanguncha ko'rinmaydi (motion SSR) | LCP 6.8 s |
| 7 | Keraksiz 151 KB shrift preload (Unbounded latin-ext, kirill) va saytning klient JS'ida `zod` (26 KB) | LCP oynasida 635 KB |

## O'zgarishlar

- `vercel.json`: `"regions": ["syd1"]` — funksiyalar bazaga yaqin. Bekor qilish: shu qatorni olib tashlash.
- `supabase/migrations/20261025100000_perf_helper_calls.sql` — faqat 3 funksiya tanasi (`create or replace`), jadval/ma'lumotga
  tegmaydi. Helper'lar `(select …)` bilan bir marta hisoblanadi. 4 foydalanuvchi uchun natijalar oldin/keyin **aynan bir xil**;
  pgTAP: 1333/1335 (ikkala holatda ham o'sha 2 ta eski xato: 029, 031).
- `lib/chat.ts`: `loadMyChats` so'rov ichida bir marta (`cache`).
- `LiveRefresh`: yashirin tab render qilmaydi, ko'rinishi bilan bir marta yangilanadi.
- Sayt: GPU'siz qurilmada (failIfMajorPerformanceCaveat) mavjud 2D logotip zaxirasi; kirish animatsiyalari CSS'da (aynan
  o'sha egri chiziq, davomiylik, kechikish; "ko'rinishga kirganda" — o'sha IntersectionObserver, `-12%`, bir marta);
  `left` → `transform` (matematik bir xil harakat); Unbounded faqat latin preload (@font-face qoidalari o'zgarmagan);
  zod sxemalari `lib/site/schema.ts` ga (faqat server); 3D pufak logotiplari 640 px optimizer orqali.

## Natijalar

| Lighthouse (lokal, PSI kabi GPU'siz) | Oldin | Keyin |
|---|---|---|
| Bosh sahifa, mobil | 36 | 87 |
| Bosh sahifa, desktop | 56 | 99 |
| Ichki sahifalar, mobil | 82–84 | 88–90 |

| Baza (bir xil ma'lumot) | Oldin | Keyin |
|---|---|---|
| `get_crm_summary` (tizim egasi / xodim) | 5 490 / 8 006 ms | 22 / 9 ms |
| `get_my_chats` | 295 ms | 16 ms |
| `get_client_leads` | 57 ms | 4 ms |

Panel sahifasi TTFB (simulyatsiya): 200 ms RTT (hozirgi `iad1`) ~480 ms → 3 ms RTT (`syd1`) ~60–95 ms. Chat: yuboruvchi
~1.8 s → ~0.19 s, qabul qiluvchi ~1.8 s → ~0.8 s (asosan region hisobidan).

## Ochiq muammo (mavjud, tuzatilmagan)

Katta xonalarda chat ba'zan qotib qoladi: React transition'i "suspended, never pinged" holatda qoladi va yangi xabar
ko'rinmaydi (asl kodda 12 xabardan 4 tasida qabul qiluvchi). Sabab Next.js 15.5 router / RSC oqimida; tekshiruv davom etishi
kerak. Chat klientiga kiritilgan tajribaviy o'zgarishlar shu sababli qaytarildi.

Yana: obunasi yo'q mijozda `/kabinet/tarif` 500 qaytaradi (`get_client_plan` → `is_current: null`, Zod boolean kutadi) —
mavjud xato, tegilmagan. Next.js 15.5.27/28 da RSC xavfsizlik tuzatishlari bor — yangilash tavsiya etiladi.

## Deploy tartibi

1. `npx supabase db push` (faqat yangi migratsiya).
2. Vercel'ga odatdagidek deploy (PRODUCTION_SETUP.md 4-bo'lim) — region `syd1` shu bilan qo'llanadi.
3. PageSpeed'ni qayta o'lchash.
