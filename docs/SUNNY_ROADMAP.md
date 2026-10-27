# SUNNY — yo‘l xaritasi va holat

Manba: egasining "SUNNY AI — Ultimate Master Prompt" (§0–§53) va 2026-10-27 dagi override: **AI provayder — Google
Gemini (asosiy)**, OpenAI hozircha yo‘q (`OPENAI_API_KEY` talab qilinmaydi), keyin ulash uchun modul arxitektura.
Bu fayl har sessiyada yangilanadi: yangi sessiya shu yerdan davom etadi. Holat faqat ishlashi tekshirilgan narsa uchun ✅.

Belgilar: ✅ ishlaydi (tekshirilgan) · 🟡 qisman · ⬜ hali yo‘q · ⛔ tashqi to‘siq

## Joriy holat (2026-10-27, 2-sessiya)

| Bosqich | Holat | Izoh |
|---|---|---|
| 1. Core foundation | ✅ | branch `feat/sunny-phase1`, production'ga **deploy qilinmagan** |
| 2. Living character | 🟡 | emotsiya, mood physics, avtonom hayot, thruster, jismoniy reaksiyalar ✅; bitta renderer va 2D↔3D solishtirish yo‘q |
| 3. Voice assistant | 🟡 | panelsiz ovoz rejimi bor; wake-word, spatial audio, summon yo‘q |
| 4. AI intelligence (Gemini) | 🟡 | provayder registri, tokensiz buyruqlar bor; byudjet nazorati, deterministik backend buyruqlari yo‘q |
| 5. Memory & personality | ⬜ | DB migratsiya + RLS kerak |
| 6. Action agent | 🟡 | mavjud asboblar ishlaydi (davomat, vazifa, chat, kontent); mission/delegation/vision yo‘q |
| 7. Advanced experiences | 🟡 | easter egg'lar, ovoz kartochkasi; rituals/proactive/briefing yo‘q |
| 8. Cross-platform app | 🟡 | PWA + Web Push oldin qilingan (7ed0570); bu sessiyada audit qilinmadi |
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

### 3-bosqich — Voice
1. ⬜ **"Sunny" wake-word (§12)**: foreground, ixtiyoriy (🎙 yonida "quloq" tugmasi), `SpeechRecognition` continuous
   (Chrome/Edge/Android). Gemini tokeni sarflanmaydi, lekin brauzer audioni o‘z serveriga yuboradi — ⛔ to‘liq on-device
   emas. iPhone PWA fonda tinglay olmaydi (Apple cheklovi) — 🎙 tugmasi fallback.
2. ⬜ Summon parvozi (§12), ⬜ spatial audio (`StereoPannerNode`, o‘chirish sozlamasi bilan, §16).
3. 🟡 Interruption (§15): 🎙/To‘xtatish va "to‘xta" ishlaydi; gapirayotganda wake-word bilan barge-in yo‘q.
4. 🟡 Qitmir sahnasidagi robot gapirish uchun uyga uchadi — joyida gapirishi kerak (renderer birlashgach).

### 4-bosqich — Intelligence (Gemini)
1. ⬜ Deterministik backend buyruqlari (§23 Layer 2): "keldimni belgila", "bugungi vazifalarim" kabi aniq so‘rovlarni
   LLM'siz `runTool` orqali (ruxsat va tasdiq qoidalari o‘sha).
2. ⬜ Kunlik/oylik so‘rov byudjeti, takror so‘rovlar keshi, suhbat xulosasi (uzun tarixni qisqartirish).
3. ⛔ OpenAI — kalit yo‘q (override). Adapter joyi tayyor.

### 5-bosqich — Memory & personality
⬜ Jadvallar: `assistant_memory` (user/company/partner, RLS: faqat o‘zi; company — o‘qish hammaga, yozish egaga),
`assistant_style_examples` (Personality Learning Studio, faqat Tizim egasi tasdiqlaydi), sozlamalar (humor, rasmiylik…).
Foydalanuvchi o‘z xotirasini ko‘rish/o‘chirish sahifasi. Public tashrifchiga xotira yo‘q.

### 6-bosqich — Action agent
Mavjud (✅, `lib/assistant/tools.ts`, `agent.ts`): attendance, overview, issues, team, search, check_in, create_task,
update_task, set_content_status, send/edit/delete_message, tasdiqlash tokenlari. ⬜ Mission mode (ko‘p qadamli reja +
qisman natija hisoboti), Smart delegation (real yuklama/ko‘nikma), Sunny Vision (joriy route/entity kontekstini
yuborish), Universal search kengaytmasi, Predictive (qoidalarga asoslangan), Partner concierge.

### 7–8-bosqich
⬜ Holographic task cards (ovoz kartochkasi asos), daily rituals, proactive reminders, daily briefing (real ma’lumot),
⬜ ixtiyoriy ovoz biometriyasi (rozilik bilan, autentifikatsiya o‘rnini bosmaydi). PWA/Push: mavjud tizimni audit
qilish — badge, deep link, bildirishnoma sozlamalari, quiet hours.

## Chiqarib tashlangan (egasi rad etgan, §49)
Quality Guardian, Meeting Copilot, Time Machine, Executive Intelligence.

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
