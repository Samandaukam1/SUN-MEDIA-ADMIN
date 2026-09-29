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
   - Authorized JavaScript origins: `https://samandaukam1.github.io`, `http://localhost:3000`
     (admin panel domeni paydo bo'lganda uni ham qo'shing)
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

## 4. Admin panel hosting (Vercel)

Meta wizard va katta boshqaruv web panelda ishlaydi. Panel Next.js server kerak qiladi, shuning uchun GitHub Pages emas.

1. https://vercel.com → **Add New Project** → ADMIN repo.
2. Environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL=https://vpxqviyacraeymgegvll.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon/publishable key>`
   - `SUPABASE_SECRET_KEY=<service_role>` — faqat server env, **Sensitive** belgisi bilan
   - `NEXT_PUBLIC_SITE_URL=https://<admin-domeni>`
3. Deploydan keyin:
   - Domenni `supabase/config.toml` → `[remotes.production.auth].additional_redirect_urls` ga
     `https://<admin-domeni>/auth/callback` qilib qo'shing va `npx supabase config push` qiling.
     Diqqat: bu buyruq tasdiq so'ramasdan qo'llanadi.
   - `META_ALLOWED_RETURN_ORIGINS` secret'iga domenni qo'shing.
   - Domenni Google OAuth origins ro'yxatiga ham qo'shing.

## 5. Tizim egasi (System Owner)

Cloud'da hali Tizim egasi yo'q. Tavsiya: `sunadmin1@mail.com` (hozir roli yo'q) — tasdiqlasangiz, rol beriladi.
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

## 8. Xavfsizlik — qo'lda yoqiladigan narsalar

- **Leaked password protection** (HaveIBeenPwned): Supabase → Authentication → Passwords (Pro rejada).
- Git tarixida maxfiy kalit topilmadi, rotatsiya shart emas. Service role faqat ADMIN server env'da.
- Test parol `SunMedia2026!` faqat preview akkauntlari uchun. Production'ga o'tishdan oldin ularning parolini
  admin paneldan tiklang yoki akkauntlarni bloklang.

## 9. Web preview'ni yangilash

```sh
cd "SUNMEDIA USER"
rm -rf dist && (set -a; . ./.env; set +a; EXPO_NO_DOTENV=1 EXPO_WEB_BASE_URL=/SUN-MEDIA-USER npx expo export --platform web)
cp dist/index.html dist/404.html && touch dist/.nojekyll && rm -f dist/_redirects
# dist/ ni gh-pages branch'iga push qiling
```

O'z domeniga ko'chirishda `EXPO_WEB_BASE_URL` bermang (ildiz), domenni Supabase redirect ro'yxatiga va Google
origins'ga qo'shing.
