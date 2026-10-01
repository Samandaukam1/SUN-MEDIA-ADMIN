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
