import 'server-only';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) throw new Error('Admin Supabase server konfiguratsiyasi mavjud emas.');
export const supabaseAdmin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
