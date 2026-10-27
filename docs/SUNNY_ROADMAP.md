# SUNNY — yo‘l xaritasi va holat

Manba: egasining "SUNNY AI — Ultimate Master Prompt" (§0–§53) va 2026-10-27 dagi override: **AI provayder — Google
Gemini (asosiy)**, OpenAI hozircha yo‘q (`OPENAI_API_KEY` talab qilinmaydi), keyin ulash uchun modul arxitektura.
Bu fayl har sessiyada yangilanadi: yangi sessiya shu yerdan davom etadi. Holat faqat ishlashi tekshirilgan narsa uchun ✅.

Belgilar: ✅ ishlaydi (tekshirilgan) · 🟡 qisman · ⬜ hali yo‘q · ⛔ tashqi to‘siq

## Joriy holat (2026-10-27)

| Bosqich | Holat | Izoh |
|---|---|---|
| 1. Core foundation | ✅ | branch `feat/sunny-phase1`, production'ga **deploy qilinmagan** |
| 2. Living character | 🟡 | 10 ta asosiy animatsiya va Qitmir rejimi bor; emotsiya, mood physics, thruster, jismoniy reaksiyalar yo‘q |
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

## Keyingi qadamlar (tartib bilan)

### 2-bosqich — Living character
1. ⬜ **Bitta doimiy renderer** (§45): hozir 3 ta canvas (launcher, chat sarlavhasi, Qitmir sahnasi). Bitta "stage"
   renderer'ga birlashtirish → robot sahifa bo‘ylab har ikki rejimda yashaydi, route almashganda saqlanadi.
2. ⬜ **Autonomous life mode normal rejimda (§7)**: `qitmir/brain.ts` o‘yinlaridan (logo, harflar, karta, tomosha,
   uyqu) kursor quvishsiz "yumshoq" profil. Sozlama bilan (default — mo‘tadil), forma/modal'da uyga qaytish bor.
3. ⬜ **Neon thruster (§6)**: uchayotgan robot ostida tezlikka bog‘liq sprite/konus (launcher halqasi uslubida).
4. ⬜ **Emotional State Controller (§9, §11, §20)**: 20 holat, intensivlik, decay, o‘tishlar; ko‘z/bosh/qo‘l/parvoz
   tezligi/neon/ovoz prosodiyasi/so‘z tanloviga ta’sir. `MotionDirector` + `QitmirBrain` ustidan bitta qatlam.
5. ⬜ **Jismoniy reaksiyalar (§10)**: head-pat, tap, push/flick, ketma-ket urish → jahl/chetlab o‘tish. Canvas
   `pointer-events:none` — hit-test robot doirasida, sahifa click'ini o‘g‘irlamasdan. High-five: chap qo‘l rigi bor.
6. ⬜ Asl 2D↔3D old ko‘rinishini ortografik solishtirish (avvalgi rekonstruksiya: `robot/sculpt.ts`).

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
