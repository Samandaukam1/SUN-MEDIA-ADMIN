# SUN MEDIA — yakuniy operatsion model (2026-09-29)

Claude boshlagan refactor mavjud diff ustidan davom ettirildi. Avvalgi o‘zgarishlar saqlandi.

- `system_owner`: faqat Web Admin. Barcha ruxsatlar; quyi rol bloklash, parol tiklash, demote yoki ruxsatlarini almashtirishni bajara olmaydi. Oxirgi faol tizim egasi himoyalangan.
- `owner` (Rahbar) va `director`: standart ruxsatlari nazorat, statistika va mijoz chatlarini kuzatish uchun. Kundalik boshqaruv Admin zimmasida.
- Admin mobil: **Bosh sahifa / Kalendar / Ishlar / Xabarlar / Akkaunt**. Ishlar vazifa, kontent va syomkani birlashtiradi. Davomat, fayllar, deadline, xabarlar va yuklama mavjud ruxsatlar orqali ishlaydi.
- Web: xodim/mijoz yaratish, login provisioning, rollar/ruxsatlar, tariflar, shartnomalar, rejalashtirish va ommaviy boshqaruvning mavjud ekranlari saqlangan.
- Xodim: rol va ruxsatlari, biriktirilgan ishlar hamda staff shared data.
- Mijoz: **Bosh sahifa / Kalendar / Studiya / Xabarlar / Akkaunt**. Kuzatish va Admin bilan chat. Client approval/reject/revision amallari yopilgan; eski havolalar bosh sahifaga yo‘naltiriladi.
- Kontent faqat ichki tekshiruvga yuboriladi; Admin/tegishli ruxsatli staff tayyor deb belgilaydi yoki ichki tuzatishga qaytaradi. Tarixiy client-review ishlarini staff tugata oladi.
- Davomatni Admin belgilaydi; xodim self-check-in yo‘q.
- Task va content detail: **Hozirgi holat / Mas’ul / Muddat**, yakunlangan ishlarda ham. Mijozga mas’ul aloqa nuqtasi Admin ko‘rsatiladi.
- CRM / Meta Ads o‘zgartirilmadi.

## Baza va akkauntlar

`20260929100000_operating_model.sql` Claude tomonidan lokal bazaga avval qo‘llangan edi. U saqlandi; davomiy tuzatish `20260929100001_complete_operating_model.sql` bilan lokal bazaga qo‘llandi. Reset qilinmadi. Tarixiy status, approval, revision, fayl va sanalar o‘chirilmadi; eski approval eslatmalari o‘chirib qo‘yildi.

Foydalanuvchi ko‘rsatmasi bilan mavjud `system@sunmedia.local` (web tizim egasi) va `editor@sunmedia.local` (oddiy Montajyor) akkauntlari saqlandi. Shaxsiy akkaunt taxmin orqali qayta rollanmadi.

Cloud DB deploy bajarilmadi. Production rolloutda ikki migratsiya ham kerak; alohida ishonchli web akkauntga `system_owner` berilganini tekshirish zarur. Migratsiya production foydalanuvchisini email asosida taxminan yaratmaydi yoki boshqa akkauntga owner huquqini bermaydi; seed faqat lokal muhit uchun.

## Cheklangan tekshiruv

- USER: TypeScript, iOS production JS/Hermes bundle.
- ADMIN: Next.js production build (type/lint bilan).
- DB: public/private SQL type lint; security advisor error darajasi — xato yo‘q.
- Mavjud modelga tegishli pgTAP fayllari: 001, 003, 004, 010, 018 — 208 tekshiruv o‘tdi. To‘liq suite kengaytirilmadi/ishga tushirilmadi.
- Simulator/browser QA va native signed app build bajarilmadi.
