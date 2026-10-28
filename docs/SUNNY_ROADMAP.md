# SUNNY — yo‘l xaritasi va holat

Manba: egasining "SUNNY AI — Ultimate Master Prompt" (§0–§53) va 2026-10-27 dagi override: **AI provayder — Google
Gemini (asosiy)**, OpenAI hozircha yo‘q (`OPENAI_API_KEY` talab qilinmaydi), keyin ulash uchun modul arxitektura.
Bu fayl har sessiyada yangilanadi: yangi sessiya shu yerdan davom etadi. Holat faqat ishlashi tekshirilgan narsa uchun ✅.

Belgilar: ✅ ishlaydi (tekshirilgan) · 🟡 qisman · ⬜ hali yo‘q · ⛔ tashqi to‘siq

## Joriy holat (2026-10-28, 8-sessiya — yakunlash V2, pastda «Yakunlash»)

| Bosqich | Holat | Izoh |
|---|---|---|
| 1. Core foundation | ✅ | branch `feat/sunny-phase1`; 1–9-bosqich production'da (`950b845` + migratsiya `20261028100000`, 2026-10-27, ikkala Vercel loyihasi) |
| 2. Living character | 🟡 | emotsiya, mood physics, avtonom hayot, thruster, jismoniy reaksiyalar ✅; bitta renderer va 2D↔3D solishtirish yo‘q |
| 3. Voice assistant | ✅ | wake-word, summon, barge-in, spatial audio; ovoz rejimida robot turgan joyida gapiradi |
| 4. AI intelligence (Gemini) | ✅ | provayder registri, tokensiz buyruqlar, deterministik backend buyruqlari, kunlik AI byudjeti; suhbat xulosasi ataylab yo‘q (pastda) |
| 5. Memory & personality | 🟡 | xotira, uslub, sozlamalar, rolga mos ohang ✅ — production'da (migratsiya qo‘llangan); xotira sahifasi va avtomatik takliflar yo‘q |
| 6. Action agent | ✅ | mission mode, smart delegation, predictive, universal search, partner concierge — production'da; hamkor tasdiqlashi — ilovada |
| 7. Advanced experiences | ✅ | gologramma kartalar, bayram, rituallar, proaktiv reaksiya, brifing, 3 rejim, emotsiya→ovoz; ⛔ ovoz biometriyasi (§40, sababi pastda) |
| 8. Cross-platform app | ✅ | PWA + Web Push production'da (migratsiya, push-dispatch v4, VAPID); audit + §42 DB testi 35/35; haqiqiy qurilmada sinalmagan |
| 9. Integration & release | ✅ | to‘liq test to‘plami, unumdorlik o‘lchovi, production build, deploy (pastda) |

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
   VAPID kalitlari keyin qo‘shildi (Supabase secrets va ikkala Vercel loyihasi): `/api/push/config` → enabled.
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

## 7-bosqich — bajarildi (2026-10-27, 7-sessiya) — migratsiya kerak emas

- **Gologramma kartalar (§34)** — [cards.ts](../lib/assistant/cards.ts): ovoz rejimida (panel yopiq) javob bilan birga robot
  yonidagi kartada 6 tagacha ixcham karta — nom, mijoz, vaqt, holat, bitta havola ("Ochish →", klaviatura bilan).
  Vazifalar, s’yomkalar, brifing, xavflar, tasdiqlar, nomzodlar, qidiruv natijalaridan; o‘sha asbob natijasidan quriladi
  (qo‘shimcha o‘qish yo‘q). Panel o‘zi ochilmaydi.
- **Bayram (§35)** — vazifa haqiqatan "bajarildi"ga o‘tganda yoki kontent tasdiqlanganda/joylanganda (amalning o‘zi
  `celebrate` belgilaydi, "allaqachon shu holatda" — yo‘q), server tasdiqidan KEYIN: raqs, quvonch, qisqa ibora; 15 s
  ichida bittadan ortiq emas; professional rejimda faqat bosh irg‘ash.
- **Kunlik rituallar (§36)** — [proactive.ts](../components/assistant/proactive.ts): ertalab (06–11) salom + "bugungi
  ishlaringizni aytaymi?", kechqurun (17–21, xodim) tugamagan ishlar; kuniga bir marta, "ha" deyilmaguncha hech qanday
  so‘rov yo‘q, javobni AI emas tizim beradi. Uzoq jimlikda uxlash, "Sunny!" — avvaldan bor.
- **Maxfiy buyruqlar (§37)** — 1–2-bosqichda bor (raqs, salto, jahl, uxla, xursand, quvla, qo‘l ber, yarashdik).
- **Proaktiv (§38, §43)** — bildirishnoma qo‘ng‘irog‘i (foydalanuvchining shaxsiy realtime kanali) yangi o‘qilmagan
  bildirishnomani `sm:notify` hodisasi bilan e’lon qiladi; Sunny pufakcha bilan aytadi ("Sizga yangi vazifa kelibdi:
  “…”. Ko‘rib chiqamizmi?"), robot qaraydi. Yozayotgan yoki suhbat paytida kutadi (60 s gacha). Sozlamalar (🔔 tugma):
  vazifalar, muddatlar, tasdiqlar, s’yomkalar, chat (standart o‘chiq), ovoz chiqarib aytish (standart o‘chiq). Bu
  qurilmada saqlanadi. Sunny o‘zi so‘rov yubormaydi.
- **Kunlik brifing (§39)** — `briefing` amali + router ("Bugun qanday ishlarim bor?"): bugungi va muddati o‘tgan
  vazifalar, bugungi s’yomkalar (vaqti, joyi), bugun muddati/posti bo‘lgan kontent — AI'siz, kartalar bilan.
- **Rejimlar (§44)** — Oddiy, Professional (💼, jiddiy-qisqa, kayfiyatsiz, robot uyda), Qitmir; bir vaqtda bittasi.
  Hammasida bir xil asboblar, ruxsatlar va tasdiqlar (integratsiya testi #26 tekshiradi).
- **Emotsiya → ovoz** — yaxshi kayfiyatda ovoz biroz yorqinroq, past kayfiyatda yumshoqroq, professional rejimda tekis
  (Azure prosodiyasi va brauzer ovozi; o‘sha ovoz, boshqa servis yo‘q).
- ⛔ **Ovoz biometriyasi (§40)** — qilinmadi: brauzerda ishonchli ovoz-izi uchun texnik asos yo‘q (Web Speech API faqat
  matn beradi), bepul server servisi ham yo‘q; pullik biometrik API ruxsatsiz ulanmaydi. Shaxs — tizimga kirgan sessiya
  (§40 ning o‘zi shuni afzal ko‘radi). Kerak bo‘lsa: rozilik, shablonni himoyalash va o‘chirish bilan alohida loyiha.

Tekshiruv: 153 unit (yangi 7), agent integratsiya 23/23 (yangi #25 brifing + kartalar AI'siz, #26 bayram faqat haqiqiy
o‘tishda va professional rejim faqat ohangni o‘zgartiradi), brauzer (lokal baza, Chrome) 11/11: ertalabki ritual →
"Ha" → panel ochilmasdan kartali brifing, kuniga bir marta, sozlamalar, haqiqiy bildirishnoma qatori → jonli pufakcha,
bir vaqtda bitta pufakcha, professional ↔ qitmir, sahifa xatolari yo‘q; Qitmir regressiya 4/4.
Sinalmagan: haqiqiy telefon, ovoz chiqarib proaktiv aytish (avtomat brauzerda ovoz yo‘q).

## 8-bosqich — PWA va Push auditi (2026-10-27, 7-sessiya)

Mavjud tizim (7ed0570) §41–§42 bo‘yicha ko‘rib chiqildi — qayta yozilmadi, dizayn o‘zgarmadi:
- **Manifest** ([app/manifest.ts](../app/manifest.ts)): asl Sun Media ikonkalari (any + maskable), `standalone`,
  `/app` dan start (har kim o‘z bo‘limiga), yorliqlar (Chat, Vazifalar), `launch_handler` — ochiq oyna qayta ishlatiladi.
- **Service worker** ([lib/pwa/sw-template.js](../lib/pwa/sw-template.js)): har deploy'da yangi versiya, yangilanish
  "Yangilash" tugmasi bilan (ish o‘rtasida emas); offline sahifa; maxfiy sahifa/API/chat keshlanmaydi; push → tizim
  bildirishnomasi + app badge; bosilganda kerakli sahifa (ochiq oyna navigatsiya qilinadi); Safari qoidasi (har pushni
  ko‘rsatish); obuna yangilansa o‘zi qayta ro‘yxatdan o‘tadi.
- **Deep link** ([lib/pwa/routes.ts](../lib/pwa/routes.ts), testi bor): bitta bildirishnoma panel/xodim/hamkor uchun o‘z sahifasini ochadi.
- **Sozlamalar** ([NotificationSettings](../components/pwa/NotificationSettings.tsx)): push bu qurilmada, tur bo‘yicha
  (umumiy chat, shaxsiy, rahbar topshirig‘i, vazifalar…), matnni yashirish, sokin soatlar, chat ovozini o‘chirish,
  qurilmalar ro‘yxati.
- **Safe area**: Sunny `env(safe-area-inset-*)` bilan; iOS status bar `black` (shaffof emas) — kontent xavfsiz zonada.
- **Bo‘shliq topildi va yopildi**: web push migratsiyasining (446 qator, production'da) DB testi yo‘q edi →
  [042_web_push.test.sql](../supabase/tests/database/042_web_push.test.sql), 35 tekshiruv ✅: umumiy chat — yuboruvchidan
  boshqa hamma a’zoga, xonadan tashqaridagiga hech narsa; shaxsiy chat — faqat ikkinchi odamga; ovozi o‘chirilgan
  xona; tur bo‘yicha push o‘chirgichi (ilovada qoladi); sokin soatlar (ilovada bor, push yo‘q); maxfiy preview (qulf
  ekranida jo‘natuvchi ham, matn ham yo‘q); deep link; vazifa vaqti o‘zgarishi va bekor qilinishi — faqat vazifadagilarga;
  brauzer boshqa akkauntga o‘tsa, oldingisiga mo‘ljallangan xabar u yerga ketmaydi; bildirishnomani faqat egasi ochadi.

To‘liq DB to‘plami: 1394 test, faqat oldindan mavjud ikki o‘yin testi yiqiladi (029 #8 — penalti seed'i, 031 #62 —
o‘yin analitikasi; Sunny'ga aloqasi yo‘q, o‘yin mantig‘iga tegilmadi).
⛔ Sinalmagan: haqiqiy iPhone/Android/Windows/macOS'da push yetib kelishi (qurilma yo‘q; production'da so‘nggi 3 kunda push trafik bo‘lmagan).

## 9-bosqich — integratsiya va reliz (2026-10-27, 7-sessiya)

- **Kunlik AI byudjeti** — [20261028100000_assistant_budget.sql](../supabase/migrations/20261028100000_assistant_budget.sql),
  [budget.ts](../lib/assistant/budget.ts): AI kerak bo‘lgan har bir savol — shu odam uchun bugun +1 (akkaunt yoki
  mehmonning bir tomonlama kaliti; IP yoki ism saqlanmaydi). Limit `app_settings`da (egasi o‘zgartiradi): xodim/hamkor
  300, mehmon 40. Limit tugasa — halol xabar va nima ishlayverishi; aniq buyruqlar (vazifalarim, keldim, brifing)
  hisoblanmaydi. Hisoblagich ishlamasa (migratsiyasiz) — savol o‘tadi. `private` sxemada, faqat server kaliti.
  DB testi [043_assistant_budget.test.sql](../supabase/tests/database/043_assistant_budget.test.sql) 11/11, integratsiya #27.
- **Suhbat xulosasi** — ataylab qilinmadi: xulosa har safar qo‘shimcha AI so‘rovi (bepul kvotani yeydi); kontekst —
  oxirgi 24 xabar, uzoq muddatli narsalar — xotirada (5-bosqich).
- **Unumdorlik (§45)** — o‘lchov (lokal, Chrome, 1440×900@2x, panel): oddiy rejim 60 FPS, Qitmir (robot kursorni
  quvlayapti) 60 FPS, uzun vazifalar 0 ms/3 s, 2 canvas, JS heap 174 MB (dev build). Faol bo‘lmagan canvas chizmaydi
  (`frameloop: never`), sekin qurilmada DPR pasayadi, zaif qurilma — lite, reduced motion — harakatsiz.
  🟡 Bitta doimiy renderer — qilinmadi: 3 canvas (launcher, sahna, telefonda sarlavha), bir vaqtda bittasi chizadi;
  birlashtirish ishlab turgan robotni qayta yozishni talab qiladi — foydasi (GPU kontekst soni) xavfdan kichik.
- **Production build** — `next build` ✅ (89/89 sahifa, umumiy JS 103 kB).
- **Deploy (2026-10-27, egasining ruxsati bilan)** — migratsiya `20261028100000_assistant_budget` (sinov rejimi alohida
  ko‘rildi, so‘ng qo‘llandi): limitlar 300/40, funksiya faqat server kalitiga; kod `950b845` ikkala Vercel loyihasida
  (production, Ready). Tekshiruv: ikkala sayt 200, `/api/push/config` enabled, public chat Gemini orqali javob berdi,
  byudjet hisoblagichi o‘sha so‘rovni sanadi (1 mehmon, 1 so‘rov).

## Yakunlash V2 (2026-10-28, 8-sessiya) — «Completion & Repair» master prompt

Qayta yozilmadi: mavjud tizim tuzatildi va yetishmagani qo‘shildi. Migratsiya: `20261029100000_assistant_cost`.

| Bo‘lim | Holat | Nima qilindi / nima qoldi |
|---|---|---|
| A. Ovoz zanjiri | PARTIAL | Topilgan nuqsonlar tuzatildi: wake-word jimlikdan ("no-speech") keyin 5 s gacha kar bo‘lib qolardi; "Sunny, ertaga SAFI…" uzun buyrug‘i 1,5 s da "Eshitaman!" bilan uzilardi; bitta so‘zli buyruq ("Sunny, keldim") yo‘qolardi; Sunny o‘z ovozining dumini eshitib yana uyg‘onardi; TTS xatosida javob jim qolardi (endi tizim ovozi yoki izoh); tizim ovozi tiqilib qolsa Sunny "gapirayotgan" holatda qotib qolardi (watchdog); ovoz rejimida AI xatosi aytilmasdi; "Bajaraveraymi?" dan keyin panel yopiq holda javob tinglanmasdi; oldingi tashrifda yoqilgan wake-word uchun birinchi teginish audio’ni ochadi. Brauzer (Chrome, mikrofon va TTS simulyatsiya) 12/12. **Haqiqiy mikrofon va dinamik bilan sinalmagan.** |
| A. Emotsional prosodiya | COMPLETE | Azure SSML (bright/soft/steady/qitmir) va brauzer ovozi; production’da o‘lchandi (pastda). |
| B. Agent (Gemini) | PARTIAL | Model tuzgan guruh/hamkor chat xabari aniq matn va aniq chat bilan tasdiq kartasida (token xona id’sini saqlaydi); foydalanuvchi o‘zi aytgan matn darhol ketadi. Tasdiqdan oldin `preview` (aniq yozuv). Missiya prompti: qadamlar orasida natijani uzatish. Integratsiya (lokal baza, Gemini simulyatsiya) 31/31. **Haqiqiy Gemini bilan xodim oqimlari sinalmagan** — lokal kalit yo‘q (egasi qo‘shmaslikni tanladi). |
| B. Sunny Vision | COMPLETE | Sahifa manzilidan yozuv (vazifa, mijoz, kontent, s’yomka, xodim, `?xona=` chat) → server foydalanuvchi sessiyasi bilan nomi va 2–3 faktini oladi; ko‘ra olmasa — "qaysi biri?" deb so‘raydi. DOM o‘qilmaydi, skrinshot yo‘q. Integratsiya #31. |
| C. Xotira oynasi | COMPLETE | Sunny panelidagi 🧠: o‘z eslatmalari, kompaniya qoidalari, hamkor eslatmalari, har biri "nega ishlatiladi"; tuzatish, tasdiq bilan unutish (RLS). Brauzer 7/7. |
| C. Hamkor xotirasi | COMPLETE | remember/forget/xotiram hamkorlarga ham (faqat shaxsiy); boshqa hamkor ko‘rmaydi va o‘zgartira olmaydi; kompaniya qoidasi yopiq. Integratsiya #29, pgTAP 044. |
| C. Avtomatik takliflar | COMPLETE | Doimiy odat/afzallik gapi → "eslab qolaymi?" kartasi, faqat "ha" bilan saqlanadi; savol, hazil, bir martalik reja, parol/raqam, iqtibos — taklif qilinmaydi; takror yo‘q; o‘sha mavzudagi yangi gap — almashtirish taklifi. Qo‘shimcha AI so‘rovi yo‘q. |
| C. Suhbat davomiyligi | COMPLETE | Oxirgi oynadan tashqaridagi o‘z savollari (12 tagacha, qisqartirilgan) promptga ma’lumot sifatida — AI chaqirilmaydi. |
| C. Shaxsiyat | COMPLETE | Egasining 60 tagacha namunasidan savolga mos 5 tasi (so‘zlar bo‘yicha); xodim ohangi uchun egasi bergan misol. |
| D. 2D↔3D | COMPLETE | Chrome’da bir xil qutida, harakatsiz holatda o‘lchandi: siluet IoU 0,954; 1 CSS px siljish bilan 0,987 (shakl, poza, logo, ranglar mos). 1 px farq 0,7 s o‘tishda ko‘rinmaydi — geometriya o‘zgartirilmadi. |
| D. Renderer | COMPLETE (o‘zgarishsiz) | 5 marta ochib-yopish va sahifa almashuvi: 3D saqlanadi, 2 canvas, xato yo‘q. Bitta renderer’ga ko‘chirish asoslanmadi. |
| D. Gapirish animatsiyasi | PARTIAL | Mavjud (MotionDirector pozalari, audio og‘iz, joyida gapirish); bu sessiyada yangi nuqson topilmadi, real qurilmada ko‘rilmagan. |
| E. Karta tugmalari | COMPLETE | O‘z yangi vazifasi — «Boshlash», tavsiya qilingan xodim — «Biriktirish»: imzolangan taklif, faqat bosilganda tasdiq endpointi orqali. Integratsiya #34. |
| E. Hamkor tasdig‘i | BLOCKED (biznes qoidasi) | 2026-09-29 ish modeli: "Approval is retired, not a feature toggle" — baza `client.approve`ni har doim rad etadi. Sunny chetlab o‘tmaydi: "tasdiqlayman" ga halol javob va loyiha chatiga havola. Yoqish — egasining ish modeli qarori. |
| E. Qidiruv | COMPLETE | Kirill savol lotincha ham qidiradi; takror natija bitta. pg_trgm — hajm talab qilmaguncha yo‘q. |
| F. Xarajat | COMPLETE | `private.assistant_calls`: har AI chaqiruvi — model, kirish/chiqish/kesh/o‘ylash tokenlari (provayder bergan), narx faqat egasining ro‘yxatidan (yo‘q bo‘lsa — narxsiz); oylik chegara; Sozlamalar → Sunny AI (faqat Tizim egasi). |
| F. Ishonchlilik | COMPLETE | Xatolar ajratildi: kunlik kvota, daqiqalik limit, kalit/sozlama, band (5xx), tarmoq, uzilish; mehmonga ichki buyruqlar tilga olinmaydi. Qayta urinish chegarali (mavjud). |
| G. Push | BLOCKED (qurilma yo‘q) | Production: VAPID bor, `/api/push/config` enabled, lekin `push_tokens` = 0 — hech kim hali bildirishnomani yoqmagan, yetkazish 0. Tekshiruv tartibi pastda. |

Tekshiruv (yakuniy): unit 164/164; integratsiya 31/31 (noldan qayta qurilgan baza); pgTAP 1422 (faqat oldindan mavjud 029 #8, 031 #62); brauzer: ovoz 12/12, yangi UI 14/14, 7-bosqich 11/11, Qitmir/summon 4/4; `next build` 90/90.

### Push — qurilmada tekshirish tartibi (kutilmoqda)
1. iPhone: Safari’da sunmediagroup.uz → Ulashish → «Bosh ekranga» → ilovani bosh ekrandan ochib kirish → Profil → 🔔 → «Bildirishnomalarni yoqish». Android/kompyuter: Chrome’da kirish → o‘sha tugma.
2. Ikkinchi akkauntdan umumiy chatga yozish → birinchi qurilmaga push keladi (yuboruvchiga kelmaydi); bosilganda o‘sha chat ochiladi.
3. Shaxsiy chat, vazifa biriktirish va muddatni ko‘chirish bilan takrorlash.
4. Tekshirish: `select platform, last_success_at, last_error from push_tokens` — `last_success_at` to‘ldi.

## Yakuniy holat — master prompt bo‘yicha (2026-10-27)

| Bo‘lim | Holat | Izoh |
|---|---|---|
| §1–8 Personaj, 3D, Qitmir, fizika, DOM, emotsiyalar | ✅ | Qitmir V5 + 2-bosqich; brauzer testlari |
| §9–14 Ovoz: wake-word, summon, barge-in, spatial, joyida gapirish | ✅ | ⛔ Safari/iOS'da wake-word yo‘q (platforma) |
| §15–19 Gemini, provayderlar, xotira, uslub, rolga mos ohang | ✅ | OpenAI — kalit yo‘q (override) |
| §20–28 Agent amallari, tasdiq, injection himoyasi, Vision | ✅ | integratsiya testlari |
| §29 Mission mode | ✅ | tizim hisoboti; haqiqiy Gemini rejalashtirishi sinalmagan |
| §30 Smart delegation | ✅ | faqat faktlar |
| §31 Predictive | ✅ | 9 qoida, "taxmin" |
| §32 Universal search | ✅ | RLS ichida, manbasi bilan |
| §33 Partner concierge | ✅ | o‘qish; tasdiqlash — ilovada |
| §34 Gologramma kartalar | ✅ | ovoz rejimida |
| §35 Bayram | ✅ | faqat haqiqiy o‘tishda |
| §36 Rituallar | ✅ | kuniga bir marta |
| §37 Maxfiy buyruqlar | ✅ | lokal, AI'siz |
| §38, §43 Proaktiv | ✅ | ovoz standart o‘chiq |
| §39 Brifing | ✅ | AI'siz |
| §40 Ovoz biometriyasi | ⛔ | texnik asos va bepul servis yo‘q (7-bosqich) |
| §41 PWA | ✅ | audit; haqiqiy qurilmada sinalmagan |
| §42 Web Push | ✅ | DB testi 35/35; haqiqiy qurilmada sinalmagan |
| §44 Rejimlar | ✅ | oddiy / professional / qitmir |
| §45 Unumdorlik | 🟡 | 60 FPS; bitta renderer yo‘q |
| §46 Xavfsizlik | ✅ | RLS, ruxsatlar, tasdiq, idempotentlik, rate-limit, byudjet, audit log |
| §47 Modullar | ✅ | robot/, qitmir/, wake.ts, voice.ts, lib/assistant/* |
| §49 Chiqarib tashlanganlar | — | qilinmadi (egasi rad etgan) |

## Chiqarib tashlangan (egasi rad etgan, §49)
Quality Guardian, Meeting Copilot, Time Machine, Executive Intelligence.

## Production deploy tartibi
1. `npx supabase migration list --linked` → faqat kutilgan migratsiyalar; `db push --dry-run`, so‘ng `db push`.
2. Kodni ikki loyihaga deploy (yuqoridagi usul) — kod migratsiyasiz ham xavfsiz ishlaydi.
3. Tekshiruv: `/api/push/config` → enabled; public chat javob beradi; xodim "bugun qanday ishlarim bor?".

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
