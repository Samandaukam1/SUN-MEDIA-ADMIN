import { z } from 'zod';

const publicSchema = z.object({
  url: z.url(),
  key: z.string().min(20),
});

// NEXT_PUBLIC_* are inlined at build time, so they must be referenced statically.
const parsedPublic = publicSchema.safeParse({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

export function getPublicEnv(): { url: string; key: string } {
  if (!parsedPublic.success) {
    throw new Error(
      'Supabase public sozlamalari yo‘q: NEXT_PUBLIC_SUPABASE_URL va NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (yoki ANON_KEY) ni kiriting.',
    );
  }
  return parsedPublic.data;
}
