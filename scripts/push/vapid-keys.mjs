// Prints a new VAPID key pair for Web Push and the commands that put it in place. Run once by the project owner:
//   node scripts/push/vapid-keys.mjs
// The private key goes only to the Supabase Edge Function secrets; the public key to Vercel (it is public by design).
import { generateVapidKeys } from '../../supabase/functions/_shared/webpush.ts';

const { publicKey, privateKey } = await generateVapidKeys();
console.log(`1) Supabase (push-dispatch):
   npx supabase secrets set --project-ref vpxqviyacraeymgegvll VAPID_PUBLIC_KEY=${publicKey} VAPID_PRIVATE_KEY=${privateKey} VAPID_SUBJECT=https://sunmediagroup.uz

2) Vercel (both projects), Production:
   VAPID_PUBLIC_KEY=${publicKey}
`);
