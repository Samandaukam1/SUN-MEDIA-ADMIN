# SUN MEDIA — production sozlash (qo‘lda bajariladigan qadamlar)

Kod, baza, Edge Function'lar va web preview tayyor. Quyidagilar tashqi akkaunt, to'lov yoki maxfiy kalit talab qiladi,
shuning uchun ularni egasi o'zi bajaradi. **Maxfiy qiymatlarni (client secret, app secret, parol) chatga yoki repoga
yozmang** — faqat Dashboard yoki terminal orqali kiriting.

Supabase project: **Sun Media** (`vpxqviyacraeymgegvll`)

| Nima | Qiymat |
|---|---|
| Web preview | https://samandaukam1.github.io/SUN-MEDIA-USER/ |
| Supabase Auth callback (Google/Apple) | `https://vpxqviyacraeymgegvll.supabase.co/auth/v1/callback` |
| Meta OAuth redirect | `https://vpxqviyacraeymgegvll.supabase.co/functions/v1/meta-connect` |
| Meta webhook | `https://vpxqviyacraeymgegvll.supabase.co/functions/v1/meta-webhook` |
| Ilova deep link sxemasi | `sunmedia://` |
| iOS bundle / Android package | `com.sunmedia.user` |

Auth redirect ro'yxati allaqachon sozlangan (`supabase/config.toml` → `[remotes.production]`):
`https://samandaukam1.github.io/SUN-MEDIA-USER/**`, `sunmedia://**`, Site URL — preview manzili.

---

## 1. Google bilan kirish

1. https://console.cloud.google.com → yangi project **SUN MEDIA** (yoki mavjudini tanlang).
2. **APIs & Services → OAuth consent screen**: User type **External**, App name **SUN MEDIA**, support email, logo
   (ixtiyoriy). Scopes: `openid`, `email`, `profile`. Publishing status: **In production**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://sunmedia-admin.vercel.app`, `https://samandaukam1.github.io`,
     `http://localhost:3000`
   - Authorized redirect URIs: `https://vpxqviyacraeymgegvll.supabase.co/auth/v1/callback`
4. **Supabase Dashboard → Authentication → Sign In / Providers → Google → Enable**: Client ID va Client Secret'ni
   joylashtiring → **Save**.
5. Tekshirish: preview'ni yangilang — kirish sahifasida **“Google bilan kirish”** tugmasi o'zi paydo bo'ladi
   (ilova faqat yoqilgan provider'larni ko'rsatadi).

Qanday ishlaydi:
- Admin oldin yaratgan email bilan Google'dan kirsa, Supabase uni o'sha akkauntga bog'laydi (rol va profil saqlanadi).
- Noma'lum Google akkaunt hech qanday rol olmaydi. U "Hisobingiz faollashtirilmoqda" ekranida kutadi.
  Adminlarga "Yangi kirish so'rovi" xabari keladi.
- Admin web panelda **Jamoa → Akkauntlar → Kirish so'rovlari** bo'limida rol yoki kompaniya beradi, yoki rad etadi.

## 2. Parolni tiklash emaillari (SMTP)

Supabase'ning standart pochtasi faqat project a'zolariga va soatiga bir necha xat yuboradi. Real foydalanuvchilar uchun:
**Supabase → Authentication → Emails → SMTP Settings → Enable custom SMTP** (Resend, Brevo, Google Workspace va h.k.).
Sender: `no-reply@<domeningiz>`, nom: **SUN MEDIA**.

Havola ilovaning `/reset-password` sahifasiga qaytadi (web va `sunmedia://`). Unda yangi parol o'rnatiladi.

## 3. Meta (Lead Ads CRM + Instagram statistika)

1. https://developers.facebook.com → **My Apps → Create App**, turi **Business**, nomi **SUN MEDIA**.
   SUN MEDIA Business Manager'iga bog'lang.
2. Mahsulotlar qo'shing: **Facebook Login for Business**, **Webhooks**, **Instagram** (Instagram API with Facebook Login),
   **Marketing API**.
3. **Facebook Login → Settings → Valid OAuth Redirect URIs**:
   `https://vpxqviyacraeymgegvll.supabase.co/functions/v1/meta-connect`
4. **App settings → Basic**:
   - Privacy Policy URL va Terms URL'ni kiriting (Live rejim uchun majburiy).
   - **App ID** va **App Secret**'ni oling (chatga yozmang).
5. Terminal, ADMIN papkasi — `<...>` o'rniga o'z qiymatlaringiz:
   ```sh
   npx supabase secrets set --project-ref vpxqviyacraeymgegvll \
     META_APP_ID=<app id> META_APP_SECRET=<app secret> \
     META_WEBHOOK_VERIFY_TOKEN=<o'zingiz o'ylab topgan uzun so'z> \
     META_ALLOWED_RETURN_ORIGINS=http://localhost:3000,https://<admin-panel-domeni>
   ```
   `META_STATE_SECRET`, `META_SYNC_SECRET` va push secret'lari allaqachon o'rnatilgan.
6. **Webhooks → Page → Subscribe**:
   - Callback URL: `https://vpxqviyacraeymgegvll.supabase.co/functions/v1/meta-webhook`
   - Verify token: 5-qadamdagi `META_WEBHOOK_VERIFY_TOKEN`
   - Field: **leadgen**
   Wizard ham obunani avtomatik qo'yishga harakat qiladi.
7. **App Review** (real mijoz lidlari va Instagram statistikasi uchun Advanced Access):
   `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_manage_ads`, `leads_retrieval`,
   `instagram_basic`, `instagram_manage_insights`, `ads_read`, `business_management`. Business Verification talab qilinadi.
   Review tugaguncha faqat ilova rollaridagi (Admin/Developer/Tester) Facebook profillar ulay oladi.
8. Har bir mijoz sahifasi uchun: **Meta Business Suite → Settings → Integrations → Leads access** → SUN MEDIA ilovasiga
   (CRM) ruxsat bering. Bu qilinmasa webhook keladi, lekin lid javoblari o'qilmaydi.
9. Ulash: admin panel → **Mijozlar → [mijoz] → Integratsiyalar → Facebook orqali ulash**. So'ng sahifa, Instagram,
   lid formalar, reklama akkaunti va CRM shablonini tanlab **Saqlash**.
10. Sinov: https://developers.facebook.com/tools/lead-ads-testing — sahifa va formani tanlab test lid yarating.
    U **CRM → Lidlar**da (web va Admin mobil) paydo bo'ladi. Admin uni mijozga yuborganda mijoz ilovasida ko'rinadi.

Instagram statistikasi har kuni 03:00 (Toshkent) da yangilanadi. Birinchi ulashda oxirgi 30 kun olinadi.
Obunachilar tarixi ulangan kundan boshlab saqlanadi.

## 4. Admin panel hosting (Vercel) — bajarildi

Panel internetda: **https://sunmedia-admin.vercel.app** (Vercel akkaunti `samandaukam1`, loyiha `sunmedia-admin`).
Next.js server kerak, shuning uchun GitHub Pages emas.

- Production env (Vercel → Project → Settings → Environment Variables):
  - `NEXT_PUBLIC_SUPABASE_URL=https://vpxqviyacraeymgegvll.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>`
  - `SUPABASE_SERVICE_ROLE_KEY=<service_role>` — **Secret** (Sensitive), faqat server
  - Sayt manzili `VERCEL_PROJECT_PRODUCTION_URL` dan olinadi; maxsus domen ulansa `NEXT_PUBLIC_SITE_URL` qo'shing.
  - `npm run build` oldidan `scripts/build-check.mjs` ishlaydi: production'da yetishmagan yoki lokal manzilga qaragan
    sozlama build'ni to'xtatadi; `NEXT_PUBLIC_` nomi ostidagi server kaliti har doim to'xtatadi.
- Deploy CLI orqali (Git integratsiyasi ulanmagan — yangi commit o'zi chiqmaydi). Faqat commit qilingan kodni yuborish uchun:
  ```sh
  rm -rf /tmp/admin-deploy && mkdir /tmp/admin-deploy && git archive HEAD | tar -x -C /tmp/admin-deploy
  mkdir /tmp/admin-deploy/.vercel && cp .vercel/project.json /tmp/admin-deploy/.vercel/
  cd /tmp/admin-deploy && npx vercel deploy --prod
  ```
  `.vercelignore` `.env*`, `/supabase`, `/tests`, `/docs` ni yuklamaydi.
- Supabase Auth redirect ro'yxatiga `https://sunmedia-admin.vercel.app/**` qo'shilgan (Management API orqali, faqat shu
  maydon; `config.toml` → `[remotes.production.auth]` ham mos). **`config push` qilmang** — `config diff` ni o'qing:
  Twilio SMS dashboard'da yoqilgan va to'liq push uni o'chiradi.
- `META_ALLOWED_RETURN_ORIGINS=http://localhost:3000,https://sunmedia-admin.vercel.app` (Edge Function secret).
- Google OAuth origins ro'yxatiga admin domeni 1-bo'limda kiritilgan.

## 4a. Ochiq sayt (landing)

- Panel domeni endi **ochiq sayt**: `/`, `/xizmatlar`, `/keyslar`, `/keyslar/<slug>`, `/hamkorlar`, `/biz-haqimizda`,
  `/aloqa` (+ `robots.txt`, `sitemap.xml`, OG rasm). Panelning bosh sahifasi `/panel` ga ko'chdi.
- Kirish 4b-bo'limda. (Avvalgi 6 xonali footer kodi 2026-10-13 da login oynasi bilan almashtirildi; `private.site_gate`
  jadvali bazada qoldi, ilova uni ishlatmaydi.)
- Arizalar limiti (bazada): bir tashrifchidan 10 daqiqada 3 ta, hammasi bo'lib soatiga 120 ta. Tashrifchi kaliti —
  IP'ning HMAC'i (IP saqlanmaydi). Ixtiyoriy env: `SITE_GATE_SECRET` (HMAC siri; bo'lmasa server kalitidan olinadi).
- Kontent: **Panel → Sayt** (ruxsat `site.manage`, standart Admin rolida). Saqlangan o'zgarish saytda darhol chiqadi
  (`revalidateTag`). Rasmlar `branding` bucket'ining `site/` papkasida (2 MB gacha, brauzerda WebP'ga siqiladi);
  o'chirilgan yoki almashtirilgan rasm storage'dan ham o'chadi. Bo'sh bo'limlar (hamkorlar, keyslar, raqamlar, fikrlar)
  saytda o'zi yashirinadi — soxta ma'lumot qo'yilmagan.
- Sayt kontentini server `get_site_content()` orqali service role bilan o'qiydi: anonim mijoz hech qanday funksiyani
  chaqira olmaydi (016 xavfsizlik invarianti saqlangan).
- Arizalar: **Panel → Sayt → Arizalar** (Yangi / Ko'rilgan / Arxiv). Yangi ariza `site.manage` egalariga bildirishnoma va
  mobil push yuboradi. CRM emas — oddiy ro‘yxat.
- **Hamkorlar pufaklari** (bosh ekran): faol va logotipi bor hamkorlar SUN MEDIA 3D logotipi atrofidagi shisha pufaklarda
  chiqadi — kompyuterda bir vaqtda 5 tagacha, telefonda 3 tagacha. Hamkorlar ko'p bo'lsa, har 15–25 soniyada bittasi chetga
  chiqib, eng uzoq ko'rsatilmagan hamkor kirib keladi. Pufak bosilsa (yoki Tab + Enter) yoriladi va 2–4 soniyadan keyin
  chetdan qaytadi. Mantiq `lib/site/bubbles.ts` da (testlar: `tests/bubbles.test.mjs`), chizish
  `components/site/hero/PartnerBubbles.tsx` da. Hamkor qo'shish/o'chirish/faol-nofaol — **Panel → Sayt → Hamkorlar**; pufaklar va
  "Hamkorlar" sahifasi bitta ro'yxatdan ishlaydi. SVG logotip brauzerda WebP'ga aylantiriladi; `site/` papkasiga `.svg` yozilmaydi.
- **Hamkor sahifasi** (`/hamkorlar/<manzil>`, masalan `/hamkorlar/safi`): hamkor kartasi yoki logotip lentasi bosilganda
  ochiladi — logotip, hamkorlik yili, natijalar, "Hamkorlik haqida", "Nimalar qildik", hamkorlik tarixi, syomkadan rasmlar
  (katta ko'rinishda ochiladi), shu hamkor bilan keyslar va uning fikri. Hammasi Panel → Sayt → Hamkorlar → hamkorni
  tahrirlash → "Hamkor sahifasi" qismida (24 tagacha rasm, tartibini o'zgartirish mumkin). Migratsiya:
  `20261015100000_partner_pages.sql` (mavjud hamkorlarga manzil nomidan yasaladi).
- **Tariflar**: `/tariflar` sahifasi, bosh sahifa bloki va menyudagi "Tariflar". Boshqaruv — **Panel → Sayt → Tariflar**: nom,
  tavsif, narx ("aniq", "dan boshlab" yoki "Kelishiladi"), valyuta (UZS/USD/EUR), oylik yoki bir martalik, "Tavsiya etiladi"
  (bittasi), faol/yashirin, tartib va xizmatlar (nom, miqdor, izoh, tartib). Bu ro'yxat mijoz obunalaridagi ichki tariflardan
  (`plans`, Mijozlar → Tariflar) alohida — ular mobil ilova kvotalarini boshqaradi. Narx kiritilmaguncha sahifada "Tariflar tez
  orada e'lon qilinadi" ko'rinadi.
- Menyu va bosh ekrandagi asosiy tugma endi **"Hamkorlarimiz"** (`/hamkorlar` ga olib boradi); nomi Panel → Sayt → Matnlar →
  "Asosiy tugma" da. "Ariza qoldirish" formasi Aloqa sahifasi, yakuniy blok va tarif kartalarida qoladi.
- Migratsiya: `20261014100000_site_plans_partner_bubbles.sql` (qo'shimcha: `site_plans`, `site_plan_items`, `site_save_plan`,
  `/tariflar` sahifasi va bloki, tugma nomi, `.svg` taqiqi).
- Footerdagi "developed by Jaxongirmans IT Teams" banneri `https://t.me/jaxongirman` ga olib boradi
  (`public/credits/jaxongirmans-it-teams.png`).


## 4b. Kirish va kabinetlar (xodimlar va hamkorlar)

- Footerda ikkita tugma: **“Xodimlar uchun”** (matni Sayt → Matnlar'da) va **“Hamkorlar uchun”**. Ikkalasi bir xil
  login oynasini ochadi: Email (login) + parol (ko'rsatish/yashirish), xatolar aniq. Tizim bitta (Supabase Auth).
- Qaysi kabinet ochilishini **serverdagi akkaunt** belgilaydi (tugma, URL yoki brauzer emas): Tizim egasi va boshqaruv
  (`dashboard.view` / `employees.manage` / `clients.manage`) → `/panel`; boshqa xodimlar → `/xodim`; hamkor akkauntlari
  → `/kabinet`. Masalan SAFI “Xodimlar uchun” orqali kirsa ham `/kabinet` ochiladi. Domen ochilganda hamma uchun sayt
  chiqadi; login oynasi **faqat** footerdagi ikki tugma bosilganda ochiladi. Kirmagan odam yopiq sahifaga (yoki eski
  `/login` manziliga) borsa, oddiy bosh sahifaga qaytadi. Bloklangan / to'xtatilgan / rolsiz akkaunt kira olmaydi.
- **Vaqtinchalik parol** (admin yaratgan yoki tiklagan): birinchi kirishda `/parol` majburiy — joriy parol + yangi parol
  (kamida 10 belgi, harf va raqam, login'siz). Shundan keyin `mark_password_changed` belgilanadi.
- **Parolni tiklash**: Panel → Jamoa (xodim) yoki Mijoz → Loginlar (hamkor) → “Parolni tiklash” — yangi kuchli
  vaqtinchalik parol bir marta ko'rsatiladi (`authorize_password_reset` + Auth admin). O'z-o'zini email orqali tiklash
  custom SMTP sozlangach qo'shiladi.
- **Urinishlar limiti** (bazada, `site_login_begin/finish`, faqat server kaliti bilan): bir login + bir tashrifchi
  15 daqiqada 5 xato → 15 daqiqa blok; bir tashrifchi 15 daqiqada 20 xato; bir login hamma joydan soatiga 30 xato.
  Login va IP bazaga faqat HMAC holida yoziladi. Supabase Auth'ning o'z limitlari ham amal qiladi.
- **Chiqish** shu brauzer sessiyasini tugatadi (boshqa qurilmalar qoladi) va keshni tozalaydi; yopiq sahifalar
  `Cache-Control: private, no-store`.
- **Hamkor kabineti** (`/kabinet`) — faqat o'z brendi (`client_members`; `?brend=` faqat o'z a'zoligi ichida), bo'limlar:
  **Umumiy** (tarif va qolgan kunlar, bu oy chiqqan kontent va syomkalar, o'sish grafigi, keyingi tashriflar, so'nggi
  lidlar, chat, jamoa — `get_client_home`), **Natijalar** (`get_partner_cabinet`: faqat nashr qilingan statistika, davr
  va platforma filtri, foiz faqat nomi yozilgan oldingi davr bilan, “Ma'lumot kiritilmagan”), **Lidlar** (SUN MEDIA
  yetkazgan Meta lidlari va yuborilgan haftalik/oylik lid hisobotlari — `get_client_leads`, `crm_reports`),
  **Reja** (keyingi syomkalar = tashriflar, post rejasi, o'tgan tashriflar — `get_calendar_events`), **Tarif** (joriy
  tarif, shu oy bajarilishi, boshqa tariflar, “tarifni oshirish” so'rovi — `get_client_plan`, `plan_upgrade_requests`),
  **Hisobotlar** (nashr qilingan oylik hisobotlar, fayllar, PDF), **Chat** (brendning SUN MEDIA bilan umumiy chati —
  mobil ilovadagi xona; real vaqt `room:<id>`, fayl biriktirish). Hammasi foydalanuvchining o'z sessiyasi va mavjud
  RLS/RPC orqali; SUN MEDIA xodimi panel orqali faqat o'qish rejimida ko'radi. O'yinlar kabinetda yo'q.
- **Statistika kiritish** (Rahbar, Admin, SMM — `analytics.manage`): Mijoz → Statistika → oy → platforma akkaunti:
  auditoriya, faollik, Reels/post/Stories, reklama xarajati (so'm/USD), lidlar (CPL avtomatik). “Qoralama saqlash” —
  hamkorga ko'rinmaydi; “Nashr qilish” — ko'rinadi. Bir akkaunt uchun bir oyga bitta yozuv; ustma-ust davr bazada rad etiladi.
- **Hisobot** (`reports.manage`): Mijoz → Hisobotlar → tayyorlash (faqat nashr qilingan raqamlardan) → yutuqlar,
  bajarilgan / rejadagi ishlar, fayllar (PDF, rasm, Excel, Word, PowerPoint, 50 MB gacha, 20 tagacha) → “Nashr qilish”.
- **Xodim kabineti** (`/xodim`): faqat o'ziga biriktirilgan vazifalar, holat (Boshlash → Tekshiruvga / Bajarildi),
  izoh, material yuklash (o'z sessiyasi bilan; `create_file_upload` / `complete_file_upload`).
- **Yangi mijoz va yangi xodimni faqat Tizim egasi qo'shadi** (2026-10-13): `clients.create` (mijoz kompaniyasi va mijoz
  logini) va `employees.create` (yangi xodim, kirish so'roviga xodim sifatida ruxsat) hech bir rolda yo'q; Tizim egasi
  ularni avtomatik ega. Kerak bo'lsa, ma'lum odamga Jamoa → xodim → “Rol va ruxsatlar”dan berish mumkin. Admin mavjud
  mijoz/xodimlarni tahrirlash, bloklash va parol tiklashda davom etadi, lekin o'zidan yuqori rangdagilarni (Rahbar,
  Tizim egasi) tahrirlay olmaydi. Tizim egasi hammaning (Rahbar ham) ismi, lavozimi, roli va ruxsatlarini boshqaradi;
  har kim o'z ismi va telefonini **Mening profilim** (`/profil`, yon menyudagi ism) orqali o'zgartiradi.
- **Rollar nomi va yangi rollar** (Tizim egasi): Jamoa → Rollar va ruxsatlar → “Rollar nomi va yangi rollar”. Har qanday
  rolning nomini o'z so'zingiz bilan yozasiz (ichki kalit o'zgarmaydi, montaj/syomka bog'lanishlari ishlayveradi); yangi rol
  tanlangan rolning ruxsatlari bilan yaratiladi va jadvalda o'zgartiriladi; ishlatilmayotgan yangi rol o'chiriladi.
  Xodim sahifasidagi “Rol va ruxsatlar”da ham “+ Yangi rol”. Lavozim — xodim profilidagi erkin matn.
- Rahbar (`owner` roli) endi `analytics.manage` va `reports.manage` ga ham ega; rollar/xodimlarni boshqara olmaydi,
  Tizim egasiga tegolmaydi (bazadagi rank va himoya qoidalari).

## 4c. Mijoz tahlili (AI) — kalit kerak

- Panel → **Mijoz tahlili** (`/tahlil`): faqat Tizim egasi va Admin (`prospects.manage`). Yangi mijozga 15 ta savol
  (variant yoki o'z so'zlari), AI tahlili (mos tarif, ehtiyoj, xavf, birinchi oy rejasi, mijozga aytiladigan taklif) va
  Instagram tahlili (raqamlar + 6 tagacha skrinshot; engagement va nakrutka belgilari kod bilan hisoblanadi).
- **Inson qadami:** Vercel'dagi ikkala loyihaga (`sun-media-admin` — sunmediagroup.uz, `sunmedia-admin`) Production
  muhitiga `ANTHROPIC_API_KEY` qo'shing (Secret, `NEXT_PUBLIC_` prefiksisiz) va qayta deploy qiling. Ixtiyoriy:
  `AI_MODEL` (standart `claude-sonnet-5-5`). Kalit qo'shilmaguncha sahifada “AI ulanmagan” yozuvi chiqadi, savollar va
  hisob-kitob ishlayveradi.
- Instagram raqamlari qo'lda kiritiladi va skrinshot qo'shiladi: Meta ulanmagan, boshqa profillarni o'qish uchun rasmiy
  API yo'q. Skrinshotlar yopiq `prospects` bucket'ida saqlanadi.

## 5. Tizim egasi (System Owner)

Tizim egasi: **`anisjonitp@gmail.com`** (Anisjon) — egasining tasdig'i bilan 2026-10-01 da berildi. Vaqtinchalik parol
faqat egasining Mac'idagi `~/.sunmedia/preview-credentials.env` da; Google yoqilgach shu email bilan Google orqali kirish
shu akkauntga o'zi bog'lanadi (email tasdiqlangan).
Tizim egasi faqat web panelga kiradi; mobil ilovada "faqat web" ekrani chiqadi.
Adminlar uni bloklay, parolini tiklay, rolini yoki ruxsatlarini o'zgartira olmaydi (bazada himoyalangan).

## 6. Apple (Developer Program olingach)

1. https://developer.apple.com/programs → a'zolik ($99/yil).
2. App Store Connect → **My Apps → New App**: SUN MEDIA, bundle `com.sunmedia.user`, til Uzbek/Russian.
3. Terminal (USER papkasi):
   ```sh
   npx eas-cli login
   npx eas-cli env:create --environment production   # EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY (public)
   npx eas-cli build -p ios --profile production       # sertifikat va profilni EAS o'zi yaratadi
   npx eas-cli submit -p ios --profile production      # TestFlight
   ```
4. **Sign in with Apple** (iOS'da Google bo'lsa App Store talab qiladi):
   - Apple Developer'da Services ID va Sign in with Apple key yarating.
   - Supabase → Providers → **Apple → Enable** (Client IDs: `com.sunmedia.user`, secret — key'dan yaratilgan JWT).
   - Ilovada Apple tugmasi provider yoqilgach o'zi chiqadi.
5. Push: `npx eas-cli credentials` → iOS → Push Notifications key (EAS saqlaydi).
6. App Privacy (App Store Connect): Contact info (ism, email, telefon — CRM lidlari va profil), Photos/Videos
   (fayl yuklash), User ID. Kuzatuv (tracking) yo'q. Privacy Policy URL.

## 7. Android (Google Play)

1. https://play.google.com/console → developer akkaunt ($25) → **Create app**: SUN MEDIA, package `com.sunmedia.user`.
2. Push uchun Firebase project → Android app `com.sunmedia.user` → `google-services.json` → `eas credentials`
   (FCM V1 service account key) orqali yuklang.
3. Build va submit:
   ```sh
   npx eas-cli build -p android --profile production    # AAB
   npx eas-cli submit -p android --profile production   # internal testing track
   ```
   Birinchi yuklash Play Console'da qo'lda qilinishi mumkin. Data safety formasi Apple'dagi bilan bir xil.

## 8. SUN MEDIA Pro va to'lov (billing)

Qanday ishlaydi:
- **Workspace'lar.** Agentlik bitta workspace, har bir mijoz alohida workspace.
- **SUN MEDIA workspace'i** ichki, muddatsiz Pro litsenziyasida. U hech qachon to'lov qilmaydi.
- **Mijozlar** agentlik tarifini meros oladi. Promo yoki o'yin orqali o'zining shaxsiy Pro'siga ham ega bo'lishi mumkin.
- **Limitlar** (Free: 1 mijoz, 3 xodim, 30 kunlik tarix va boshqalar) kodda emas. Ular
  **Tizim boshqaruvi → Obunalar (Pro)** jadvalida sozlanadi. Narx ham shu yerda ($19.99/oy).
- **Pro tekshiruvi bazada qilinadi**, ilova uni chetlab o'tolmaydi. Yopiq imkoniyat ochilsa, ilova "Pro'ga o'tish" oynasini ko'rsatadi.

Real to'lovni ulash uchun hisob va provayder kerak: Stripe, Payme yoki Click.
1. Provayderda $19.99/oy obuna mahsulotini yarating.
2. Provayder webhook'ini qabul qiluvchi server funksiyasi har bir hodisani bazaga yozadi:
   `apply_billing_event(provider, event_id, workspace_id, 'pro', status, period_end, subscription_ref)`.
   Funksiya faqat service role uchun ochiq va bir hodisani ikki marta qayta ishlamaydi.
3. Checkout faqat web'da bo'ladi. iOS/Android ilovada tashqi to'lov tugmasi yo'q (App Store / Play qoidalari).
   Ilovada "Pro'ga o'tish" so'rov yuboradi, u Tizim egasiga boradi.
   Mobil ichida sotish kerak bo'lsa, keyinchalik Apple IAP / Google Play Billing qo'shiladi.

Hozircha to'lovsiz ham ishlatish mumkin: Tizim egasi **Obunalar → Obuna berish** orqali istalgan workspace'ga N kunlik yoki
muddatsiz Pro beradi.

## 9. Promo kodlar va o'yinlar

- **Mijozlar → Promo kodlar**: kod, Pro muddati (3/7/30/istalgan kun), boshlanish va tugash sanasi, jami va bir kishi
  uchun limit, kim uchunligi. Kod o'chirilmaydi, faqat to'xtatiladi.
  Kod noto'g'ri kiritilsa, bir soatda ko'pi bilan 10 ta urinishga ruxsat bor.
- **Mijozlar → O'yinlar**: SAFI (tutish) yoki WeDrink (quyish) shabloni, brend ranglari, urinishlar soni, qiyinlik, mukofot kunlari.
  - Yutish qoidalari: mahorat, ehtimol %, birinchi o'yin kafolati yoki "keyingi o'yinchi yutadi".
  - Mijozga aynan tanlangan qoida ko'rsatiladi.
  - Natijani server hisoblaydi. Shubhali (juda aniq yoki vaqti mos kelmaydigan) o'yinlar belgilanadi va mukofot berilmaydi.
  - O'yinlarni faqat mijozlar ko'radi.

## 10. Xavfsizlik — qo'lda yoqiladigan narsalar

- **Leaked password protection** (HaveIBeenPwned): Supabase → Authentication → Passwords (Pro rejada).
- Git tarixida maxfiy kalit topilmadi, rotatsiya shart emas. Service role faqat ADMIN server env'da.
- `SunMedia2026!` endi faqat **lokal** seed paroli (`supabase/seed.sql`, lokal Supabase). Cloud'dagi preview
  akkauntlari (`*.local`) uchun u o'chirilgan: parollar tasodifiy qiymatlarga almashtirilgan va faqat
  mashinadagi git'dan tashqari faylda saqlanadi. Ularni repo, README yoki chatga yozmang.
  Production'ga o'tishdan oldin preview akkauntlarini bloklang yoki o'chiring.

## 11. Web preview’ni yangilash

```sh
cd "SUNMEDIA USER"
rm -rf dist && (set -a; . ./.env; set +a; EXPO_NO_DOTENV=1 EXPO_WEB_BASE_URL=/SUN-MEDIA-USER npx expo export --platform web)
cp dist/index.html dist/404.html && touch dist/.nojekyll && rm -f dist/_redirects
# dist/ ni gh-pages branch'iga push qiling
```

O'z domeniga ko'chirishda `EXPO_WEB_BASE_URL` bermang (ildiz), domenni Supabase redirect ro'yxatiga va Google
origins'ga qo'shing.

## 7. Ilova (PWA) va Web Push bildirishnomalar

Ilova qismi (o‘rnatish, ikonka, offline sahifa, yangilanish) deploy bilan o‘zi ishlaydi. Telefon/kompyuterga **push**
yuborish uchun loyiha egasi bir marta quyidagini bajaradi (tartib muhim):

1. `npx supabase functions deploy push-dispatch --project-ref vpxqviyacraeymgegvll` — yangi funksiya eski va yangi
   bazani ham tushunadi.
2. `npx supabase db push` — `20261026100000_web_push.sql` (web qurilmalar, sokin soatlar, maxfiy preview, vazifa vaqti
   o‘zgarishi/bekor qilinishi bildirishnomalari).
3. `node scripts/push/vapid-keys.mjs` — chiqqan buyruqni ishga tushiring (maxfiy kalit faqat Supabase secret'ida) va
   `VAPID_PUBLIC_KEY` ni Vercel'ning ikkala loyihasiga (Production) qo‘shib, qayta deploy qiling.

Shundan keyin: Profil / Xodim kabineti / Hamkor kabineti → 🔔 → «Bildirishnoma sozlamalari» → «Bildirishnomalarni
yoqish». iPhone/iPad'da avval Safari → Ulashish → «Bosh ekranga qo‘shish» (iOS 16.4+), so‘ng ilovaning ichida yoqiladi.
Kalitlar qo‘yilmaguncha sozlamalarda «serverda hali yoqilmagan» deb ko‘rinadi — hech narsa buzilmaydi.
