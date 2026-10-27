# SUNNY — yo‘l xaritasi va holat

Manba: egasining "SUNNY AI — Ultimate Master Prompt" (§0–§53) va 2026-10-27 dagi override: **AI provayder — Google
Gemini (asosiy)**, OpenAI hozircha yo‘q (`OPENAI_API_KEY` talab qilinmaydi), keyin ulash uchun modul arxitektura.
Bu fayl har sessiyada yangilanadi: yangi sessiya shu yerdan davom etadi. Holat faqat ishlashi tekshirilgan narsa uchun ✅.

Belgilar: ✅ ishlaydi (tekshirilgan) · 🟡 qisman · ⬜ hali yo‘q · ⛔ tashqi to‘siq

## Joriy holat (2026-10-27, 6-sessiya)

| Bosqich | Holat | Izoh |
|---|---|---|
| 1. Core foundation | ✅ | branch `feat/sunny-phase1`; 1–5-bosqich kodi production'da (`59c1fcb`, 2026-10-27, ikkala Vercel loyihasi) |
| 2. Living character | 🟡 | emotsiya, mood physics, avtonom hayot, thruster, jismoniy reaksiyalar ✅; bitta renderer va 2D↔3D solishtirish yo‘q |
| 3. Voice assistant | ✅ | wake-word, summon, barge-in, spatial audio; ovoz rejimida robot turgan joyida gapiradi |
| 4. AI intelligence (Gemini) | 🟡 | provayder registri, tokensiz buyruqlar, deterministik backend buyruqlari ✅; byudjet va xulosa — DB kerak |
| 5. Memory & personality | 🟡 | xotira, uslub, sozlamalar, rolga mos ohang ✅ — production'da (migratsiya qo‘llangan); xotira sahifasi va avtomatik takliflar yo‘q |
| 6. Action agent | 🟡 | mission mode, smart delegation, predictive, universal search, partner concierge ✅ (lokal bazada sinalgan, deploy qilinmagan); hamkor tasdiqlashi — ilovada |
| 7. Advanced experiences | 🟡 | easter egg'lar, ovoz kartochkasi; rituals/proactive/briefing yo‘q |
| 8. Cross-platform app | 🟡 | PWA + Web Push (7ed0570) production'da yoqildi: migratsiya, push-dispatch v4, VAPID (2026-10-27); to‘liq audit qilinmagan |
| 9. Integration & release | ⬜ | |

## 1-bosqich — bajarildi (2026-10-27)

- **AI provayder arxitekturasi** — [providers.ts](../lib/assistant/providers.ts): `AiProvider` interfeysi, registr.
  Gemini birinchi; Claude faqat `ANTHROPIC_API_KEY` bo‘lsa zaxira; tartib `ASSISTANT_PROVIDERS`. Provayder hech narsa
  yozmasdan yiqilsa keyingisiga o‘tadi. OpenAI: shu faylda `id: 'openai'` adapterini yozib, `ALL`ga qo‘shish kifoya.
  Test: `tests/assistant-providers.test.mjs`.
- **Tokensiz mahalliy buyruqlar** — [intents.ts](../lib/assistant/intents.ts): "raqsga tush", "salto qil", "jahling
  chiqsin", "uxlab qol", "xursand bo‘l", "meni quvla", "qo‘l ber", "yarashdik", "to‘xta". AI chaqirilmaydi (brauzerda
  tekshirildi: 0 so‘rov). Robot: launcher'da `dance`/`spin`/`doze`/`success`/`fail`/`welcome` cue'lari
  ([motion.ts](../components/assistant/robot/motion.ts)); Qitmir sahnasida `brain.command()`. Test: `tests/assistant-intents.test.mjs`.
- **Ovoz rejimi ↔ matn rejimi ajratildi (§14)** — robot yonidagi 🎙 tugmasi panelni ochmaydi; Sunny panel yopiq holda
  tinglaydi, o‘ylaydi, gapiradi; javob, tasdiqlash tugmalari, natija chiplari va ovoz xatosi kichik kartochkada
  ([SunBotChat.tsx](../components/assistant/SunBotChat.tsx) `voiceOnly`). Ovoz rejimida savolga doim ovozli javob.
  "Chatda ochish" — o‘sha suhbat panelda davom etadi. Launcher robot chat holatini panel yopiq bo‘lsa ham ko‘rsatadi.
- **WebGL lifecycle xatosi** — R3F unmount'dan keyin context'ni o‘zi tushiradi; `Robot3D` buni nosozlik deb, telefonda
  chat sarlavhasidagi robotni butunlay yassi rasmga o‘tkazib qo‘yardi. Tuzatildi (brauzerda 3 marta ochib-yopib tekshirildi).

Tekshiruv: 107 unit test, `tsc`, `eslint` toza; brauzer smoke 5/5 (lokal izolyatsiyalangan Supabase).
**Tekshirilmagan:** haqiqiy mikrofonli ovozli savol → AI javobi → ovozli o‘qish zanjiri (lokal AI/TTS kaliti yo‘q).

## 2-bosqich — bajarildi (2026-10-27, 2-sessiya)

- **Emotional State Controller** — [emotion.ts](../components/assistant/robot/emotion.ts): 20 holat, intensivlik,
  yarim yemirilish, mantiqiy o‘tishlar (xafa → avval tinchlanadi; yarashish/haqiqiy muvaffaqiyat — darrov), offended →
  sulking → do‘stona (cheksiz arazlash yo‘q). Hodisalar: tasdiqlangan amal, xato, maqtov/haqorat (matndan,
  [intents.ts](../lib/assistant/intents.ts) `sentiment`), mahalliy buyruqlar, silash/urish/surish/beshlik, Qitmir,
  90 s harakatsizlik → uyqusirash, qaytish → cho‘chib uyg‘onish. Ko‘rinishi: launcher robotida `MotionDirector`
  emotsiya qatlami (faqat bo‘sh/xursand holatda; tinglash/gapirish ustun), sahna robotida `brain.setEmotion`.
  AI ohangi: so‘rovda `feeling` → [qitmir.ts](../lib/assistant/qitmir.ts) `feelingPrompt` (faqat ohang; ish va faktlar
  o‘zgarmaydi). Test: `tests/assistant-emotion.test.mjs`.
- **Mood physics (§11)** — parvoz tezligi, suzish amplitudasi, balandlik, burilish keskinligi, neon kuchi emotsiyaga
  bog‘liq (test: g‘amgin robot xursanddan sekinroq).
- **Avtonom hayot oddiy rejimda (§7)** — `brain` `persona: 'calm'`: foydalanuvchi 7 s+ harakatsiz bo‘lsa (lekin 2
  daqiqadan ko‘p emas) launcher'dan chiqib bitta joyga boradi (logo, sarlavha harflari, karta, tomosha), keyin uyga
  qaytadi; sayohatlar orasida 35–80 s. Kursorni quvlamaydi; foydalanuvchi ishlasa — uyga. Uyda kadr tsikli to‘xtaydi
  (sekundiga bir marta tekshiriladi). ⏸ ikkala rejimda. Brauzerda tekshirildi.
- **Neon thruster (§6)** — sahna robotining tanasi ostida glow + nur, tezlik/tezlanishga bog‘liq, dam olishda deyarli
  o‘chadi; oddiy rejimda lime, Qitmir'da qizil.
- **Jismoniy reaksiyalar (§10)** — boshini silash (launcher va uchayotgan robotda), bitta tegish (qaraydi), 3 marta
  urish (qo‘l qovushtiradi, "Hoy, tinchlikmi?…", keyingisidan qochadi), tez surish (muvozanatini yo‘qotib tiklanadi),
  "qo‘l ber" → qo‘lini ko‘tarib beshlik kutadi. Sahifa click'i o‘g‘irlanmaydi (canvas `pointer-events:none`).
  Test: `tests/sunny-life.test.mjs`. **Brauzerda faqat unit darajasida** — sichqoncha imo-ishoralari real qurilmada
  sinalmagan.

Tekshiruv: 121 unit test, `tsc`, `eslint` toza; brauzer smoke 7/7 (sayohat, uyda qolish, pauza, lime ko‘zlar, Qitmir).

## Keyingi qadamlar (tartib bilan)

### 2-bosqichdan qolgan
1. ⬜ **Bitta doimiy renderer** (§45): hozir 3 ta canvas (launcher, chat sarlavhasi, sahna). Birlashtirish → robot
   uyda ham, sayohatda ham bitta canvas'da; route almashganda saqlanadi.
2. ⬜ Asl 2D↔3D old ko‘rinishini ortografik solishtirish (avvalgi rekonstruksiya: `robot/sculpt.ts`).
3. ⬜ Emotsiya → ovoz prosodiyasi (hozir faqat matn ohangi va harakat).

## 3-bosqich — bajarildi (2026-10-27, 3-sessiya)

- **"Sunny!" wake-word (§12)** — [wake.ts](../components/assistant/wake.ts) `WakeListener`: robot yonidagi 👂 tugmasi
  bilan yoqiladi (sessiya davomida eslab qolinadi), faqat sahifa ko‘rinib turganda; brauzerning continuous
  `SpeechRecognition` (o‘zbekcha), to‘xtasa qayta yoqiladi, xatoda kutish oshadi, mikrofon ruxsati yo‘q bo‘lsa o‘chadi.
  Ism eshitilishi bilan robot chaqiriladi; bir nafasda aytilgan buyruq ("Sunny, bugungi vazifalarim…") darrov
  yuboriladi, aks holda "Eshitaman!" (5 xil) deb tinglaydi. Chat tinglayotganda wake to‘xtab turadi (bitta recognizer).
  Gemini tokeni sarflanmaydi. Test: `tests/assistant-wake.test.mjs`.
- **Summon (§12)** — `brain.command('summon')`: sayohatdagi robot launcher'ga to‘liq tezlikda (thruster, trail,
  banking) qaytadi, oxirida silliq qo‘nadi; uydagi robot tashrifchiga buriladi. Qaytish endi tebranishsiz (1.18 → 0.87 s).
- **Ovoz bilan to‘xtatish (§15)** — Sunny gapirayotganda "to‘xta…", "bas", "Sunny…" ovozni to‘xtatadi; qolgan gap
  yangi savol bo‘ladi ("To‘xta, avval SAFI'ni ayt" → "SAFI'ni ayt"). Sunny o‘z ovozini dinamikdan eshitsa — echo
  filtri (so‘zlarning ≥60 % i aytilayotgan matnda) e’tiborsiz qoldiradi.
- **Spatial audio (§16)** — [voice.ts](../components/assistant/voice.ts) `StereoPannerNode` + `setPan`: ovoz robot
  tomondan, yumshoq (±0.35); chat sarlavhasida 🎧 tugmasi bilan o‘chadi; telefonda markazda; panner yo‘q brauzerda markazda.

Tekshiruv: 127 unit test, `tsc`, `eslint`; brauzer smoke 7/7 (👂 Chrome'da, tinglash holati, 🎙 vaqtida pauza va
qayta tinglash, 🎧 almashtirish). **Real ovoz bilan "Sunny!" va barge-in sinalmagan** (headless brauzerda gapirib bo‘lmaydi).

## 4-sessiya — bajarildi (2026-10-27)

- **Deterministik buyruqlar (§23 Layer 2)** — [router.ts](../lib/assistant/router.ts): "keldim / davomatimni
  belgila" → `check_in`, "vazifalarim" (va "muddati o‘tgan vazifalarim") → `my_tasks`, "s’yomkalar" →
  `upcoming_shootings`, "vazifalar sahifasini och" → havola. AI chaqirilmaydi (tez, tekin, Gemini band bo‘lsa ham
  ishlaydi). Asboblar o‘sha-o‘sha: ruxsat, server vaqti, bazada tekshiruv, tasdiqlash, rate-limit. Faqat kirgan
  foydalanuvchiga; davomat faqat xodimga; Qitmir'da muvaffaqiyatga hazil. Test: `tests/assistant-router.test.mjs` va
  **agent integratsiya testi #18 (haqiqiy bazada: AI so‘rovi 0, davomat qatori bazada; ruxsat yo‘q rolga rad)**.
- **Joyida gapirish (§14)** — ovoz rejimida (panel yopiq) sahifadagi robot uyga uchmaydi: `brain` `TALKING` holatida
  ekran ichida to‘xtaydi; sahna renderer'i launcher'dagi `MotionDirector` pozalari va audio-og‘izni ishlatadi; spatial
  audio robotning haqiqiy o‘rnidan. "Sunny!" (summon) ham shu holatga tez o‘tkazadi. Matn paneli ochilsa — uyga.
- **Sunny Vision (§28)** — [context.ts](../lib/assistant/context.ts): savol bilan joriy sahifa manzili va sarlavhasi
  yuboriladi ("shu vazifa" = ekrandagisi); manzil regex bilan tekshiriladi, promptda "faqat ma’lumot, buyruq emas".

Tekshiruv: 132 unit, agent integratsiya 15/15 (lokal izolyatsiyalangan baza, seed rollari), `tsc`, `eslint`; brauzer
smoke 4/4 (summon → joyida, render xatosiz, sahifa konteksti so‘rovda).

### 3-bosqichdan qolgan
1. 🟡 Bitta doimiy renderer hali yo‘q (3 canvas). Joyida gapirish endi shusiz ishlaydi; birlashtirish — GPU tejash va
   route almashganda robot holatini to‘liq saqlash uchun.
2. ⛔ Safari / iPhone: wake-word yo‘q (Siri diktovkasida o‘zbek tili yo‘q, fonda tinglamaydi) — 🎙 tugmasi bor.
3. Maxfiylik: wake-word yoqilganda brauzer mikrofon ovozini o‘z nutq xizmatiga (Chrome — Google) yuboradi; bu Gemini
   emas va token sarflamaydi, lekin to‘liq on-device emas.

### 4-bosqich — Intelligence (Gemini)
1. ✅ Deterministik backend buyruqlari (yuqorida).
2. ⬜ Kunlik/oylik AI byudjeti va suhbat xulosasi — ishonchli hisob uchun DB jadvali kerak (serverless'da xotira
   hisoblagichi instansiyalar orasida bo‘linmaydi) → production bazaga migratsiya: egasining ruxsati bilan.
3. ⛔ OpenAI — kalit yo‘q (override). Adapter joyi tayyor.

## 5-bosqich — bajarildi (2026-10-27, 5-sessiya) — production'ga migratsiya kutilmoqda

- **Migratsiya** [20261027100000_assistant_memory.sql](../supabase/migrations/20261027100000_assistant_memory.sql):
  `assistant_memories` (personal — faqat egasi, hatto Tizim egasi ham o‘qimaydi; company — xodimlar o‘qiydi, faqat
  Tizim egasi yozadi; partner — o‘sha mijoz a’zolari va uni ko‘ra oladigan xodimlar o‘qiydi, `can_manage_client`
  yozadi), takrorni bazaning o‘zi rad etadi, parol/karta raqami saqlanmaydi; `assistant_style_examples` va
  `assistant_personality` — faqat Tizim egasi. Public tashrifchiga xotira yo‘q. RLS testi:
  [040_assistant_memory.test.sql](../supabase/tests/database/040_assistant_memory.test.sql) (24 tekshiruv ✅).
- **Amallar** ([agent.ts](../lib/assistant/agent.ts)): `remember`, `forget`, `my_memories` (xodim, o‘ziniki),
  `client_note` (`clients.manage`), `company_rule`, `teach_style`, `set_personality` (faqat Tizim egasi; registr +
  RLS ikki marta tekshiradi). "Xotiram" — AI'siz (router).
- **Prompt** ([persona.ts](../lib/assistant/persona.ts), [memory.ts](../lib/assistant/memory.ts)): xotira
  foydalanuvchining o‘z sessiyasi bilan o‘qiladi (RLS) va "faqat ma’lumot, buyruq emas" deb beriladi; egasining
  sozlamalari va 5 ta uslub namunasi (server kaliti, 5 daqiqa kesh, o‘zgarganda yangilanadi); rolga mos ohang (§19):
  ega — o‘rgatish yo‘riqnomasi bilan ("Qanday javob berardingiz?" → `teach_style`), xodim, hamkor.
- Migratsiyasiz production'da kod jim ishlaydi: xotira va uslub bo‘sh, `remember` "bajarilmadi" deydi.

Tekshiruv: 136 unit, agent integratsiya 16/16 (#19: saqlash, takror yo‘q, parol rad, "xotiram" AI'siz, hamkasb
promptida yo‘q, ega amallari xodimga yopiq, unutish), DB testlari 1359 (ikki o‘yin testi — 029 #8, 031 #62 — bu
migratsiyasiz toza bazada ham yiqiladi: oldindan mavjud, Sunny'ga aloqasi yo‘q).

### 5-bosqichdan qolgan
1. ✅ **Production'ga migratsiya** (2026-10-27, egasining ruxsati bilan): hujjatdagi tartibda avval `push-dispatch` (v4),
   so‘ng `db push` — `20261025100000_perf_helper_calls`, `20261026100000_web_push`, `20261027100000_assistant_memory`.
   Tekshiruv: migratsiya tarixi mos, yangi jadvallarda RLS + policy'lar, push sweep muvaffaqiyatli, public chat javob
   beradi. Xodim hisobida "eslab qol" → "xotiram" hali production'da sinalmagan (xodim sessiyasi yo‘q).
   Web Push'ni yoqish uchun VAPID kalitlari qoldi (docs/PRODUCTION_SETUP.md, 7-bo‘lim, 3-qadam).
2. ⬜ Xotirani ko‘rish/o‘chirish uchun alohida sahifa (hozir chatda: "xotiram", "… ni unut").
3. ⬜ Hamkorlar o‘zi "eslab qol" deya olishi (mijoz auditoriyasiga amallar berilmaydi — alohida, cheklangan amal kerak).
4. ⬜ Avtomatik xotira takliflari (ishonch darajasi bilan, foydalanuvchi tasdig‘ida), suhbat xulosasi.

## 6-bosqich — bajarildi (2026-10-27, 6-sessiya) — migratsiya kerak emas

- **Mission mode (§29)** — [mission.ts](../lib/assistant/mission.ts), engine: bir so‘rovdagi har bir o‘zgarish tizimning
  o‘z hisobotiga yoziladi; 2+ o‘zgarish bo‘lsa javob oxiriga "Natija — 1 ta bajarildi, 1 ta bajarilmadi: ✅ … ❌ … ⏳ …"
  qo‘shiladi — model "hammasi tayyor" desa ham, haqiqiy holat ko‘rinadi. Prompt: avval faktlar (client_work,
  suggest_assignee), keyin reja va "Bajaraveraymi?", bog‘liq qadam yiqilsa to‘xtash. Yangi amal **`create_shooting`**
  (`shootings.manage`, `save_shooting` RPC — panel bilan bir xil; jamoa rollari bilan; takror yaratilmaydi; jamoadan kimdir
  shu vaqtda boshqa s’yomkada bo‘lsa — ogohlantirish, rad emas).
- **Smart delegation (§30)** — [delegation.ts](../lib/assistant/delegation.ts), `suggest_assignee` (`tasks.manage`):
  ko‘nikma (`employee_skills`, egasining workflow roli), so‘nggi 90 kunda shu turdagi yakunlangan ishlar, shu mijoz bilan
  ishlagani, ochiq/muddati o‘tgan vazifalar, o‘sha kungi muddat va s’yomkalar, ta’til/dam olish kuni. Ball ko‘rsatilmaydi —
  faqat tekshirsa bo‘ladigan faktlar; yakuniy qaror rahbarniki.
- **Predictive (§31)** — [predict.ts](../lib/assistant/predict.ts), `risks` (har bir xodim, RLS bo‘yicha o‘zi ko‘radigani):
  9 ta oshkora qoida — muddat yaqin/boshlanmagan, mas’ulsiz vazifa, s’yomka oldidan tasdiqlanmagan ssenariy, tayyor
  bo‘lmagan jihoz, montaj navbati, kechikkan mijoz/ichki tasdiq, tayyor bo‘lmagan post, s’yomkalar to‘qnashuvi. Har bir
  xavf o‘z qoidasini aytadi; javob "taxmin, fakt emas". "Nima kechikishi mumkin?" — AI'siz (router).
- **Universal search (§32)** — [recall.ts](../lib/assistant/recall.ts), `recall` (xodim va hamkor): chat xabarlari,
  kontent (nom, ssenariy, tavsif, caption), eslatmalar; xodimga vazifa va izohlari ham. Faqat foydalanuvchining o‘z sessiyasi
  (RLS), so‘zlar `ilike` bilan, eng mos 8 tasi manbasi (chat/vazifa, kim, sana) bilan. Topilgan matn — begona matn:
  shu turdagi keyingi o‘zgarishlar tasdiq kutadi (`tainted`).
- **Partner concierge (§33)** — `partner_status`, `my_approvals` (faqat hamkor auditoriyasi; amallar registrida `for`):
  loyiha holati (`get_client_home` + kontent bosqichlari), tasdiq kutayotganlar. "Loyihamiz holati qanday?", "Qaysi
  postlar tasdiqlashimni kutyapti?" — AI'siz. Hamkorga xodim amallari taklif qilinmaydi va registr rad etadi.

Tekshiruv: 146 unit (yangi 10: delegation, 9 qoida, qidiruv so‘zlari, missiya hisoboti, routerlar), `tsc`, `eslint`;
agent integratsiya 21/21 (yangi #20–#24, haqiqiy lokal baza, simulyatsiya qilingan Gemini): missiyada bir qadam yiqilsa
hisobot buni aytadi va bazada faqat bajarilgani bor; takror s’yomka yo‘q, to‘qnashuv ogohlantiriladi, operatorga yopiq;
ko‘nikmali montajchi tavsiya qilinadi, ta’tilda bo‘lsa oxirga tushadi, sabablar faqat faktlar; xavflar rolga qarab
(WeDrink kontenti SAFI jamoasidagi operatorga ko‘rinmaydi); SAFI chatidagi kelishuv manbasi bilan topiladi — operator va
WeDrink topa olmaydi, SAFI topadi; har hamkor faqat o‘z loyihasini ko‘radi.

Sinalmagan: haqiqiy Gemini missiyani shu tartibda rejalashtirishi (lokalda AI kaliti yo‘q — model simulyatsiya qilingan).

### 6-bosqichdan qolgan
1. ⬜ Hamkor tasdiqlashi/izohi chatdan (`review_content_version`, `client.approve`) — ataylab qilinmadi: hamkor videoni
   ko‘rib tasdiqlashi kerak; hozir Sunny ilovadagi «Tasdiqlash» bo‘limiga yo‘naltiradi.
2. ⬜ Qidiruv uchun indeks (pg_trgm `messages.body`) — katta hajmda kerak bo‘lsa, migratsiya bilan.
3. ⬜ Missiyada jamoaga avtomatik xabar — hozir faqat rejada tasdiqlangan `send_message`.

### 7–8-bosqich
⬜ Holographic task cards (ovoz kartochkasi asos), daily rituals, proactive reminders, daily briefing (real ma’lumot),
⬜ ixtiyoriy ovoz biometriyasi (rozilik bilan, autentifikatsiya o‘rnini bosmaydi). PWA/Push: mavjud tizimni audit
qilish — badge, deep link, bildirishnoma sozlamalari, quiet hours.

## Chiqarib tashlangan (egasi rad etgan, §49)
Quality Guardian, Meeting Copilot, Time Machine, Executive Intelligence.

## Production deploy tartibi (5-bosqichdan boshlab)
1. Kodni ikki loyihaga deploy (yuqoridagi usul) — migratsiyasiz ham xavfsiz.
2. `supabase db push` (linked production loyiha) — `20261027100000_assistant_memory.sql`. Egasining ruxsati bilan.
3. Tekshiruv: xodim "eslab qol: …" → "xotiram".

## Muhit o‘zgaruvchilari

| Nomi | Holat | Vazifasi |
|---|---|---|
| `GEMINI_API_KEY` | production'da bor | asosiy AI (bepul tier — beqaror: 503/timeout) |
| `ASSISTANT_GEMINI_MODEL` | ixtiyoriy | birinchi sinaladigan Gemini modeli |
| `ASSISTANT_PROVIDERS` | ixtiyoriy | provayder tartibi, masalan `gemini,anthropic` |
| `ANTHROPIC_API_KEY` | yo‘q | ixtiyoriy zaxira provayder |
| `OPENAI_API_KEY` | yo‘q (override) | kelajakda |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | production'da bor | o‘zbekcha ovoz (uz-UZ-SardorNeural) |
| `ASSISTANT_QITMIR_RATE`, `ASSISTANT_QITMIR_PITCH` | ixtiyoriy | Qitmir ovoz prosodiyasi |

## Deploy (muhim)
Vercel'da ikki loyiha bor: **`sun-media-admin`** → sunmediagroup.uz, **`sunmedia-admin`** → sunmedia-admin.vercel.app.
`npm run deploy` faqat ikkinchisini yangilaydi. sunmediagroup.uz uchun HEAD'ni `sun-media-admin`
(projectId `prj_dNE5Fyn9EuNaNBTiQEmiGiD9GiyK`) ga xuddi shu usulda (git archive + `vercel deploy --prod`) yuborish
kerak. Rollback: Vercel'da oldingi deployment'ni promote qilish.

## Ma’lum cheklovlar
- Bepul Gemini: javob 5–20 s, ba’zan "band". Barqarorlik uchun pullik Gemini kaliti yoki `ANTHROPIC_API_KEY`.
- Wake-word va ovozni tanish brauzer imkoniyatiga bog‘liq; Safari/iOS'da cheklangan.
- Original prompt matni §50 "Phase 3" joyida kesilgan edi; qolgan qismi (§50–53) keyin kelgan va shu faylga kiritilgan.
