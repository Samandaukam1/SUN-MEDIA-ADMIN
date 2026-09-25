'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { safeNextPath, toUserMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({
  email: z.email({ message: 'Email manzilini to‘g‘ri kiriting' }),
  password: z.string().min(6, { message: 'Parol kamida 6 ta belgidan iborat' }),
});

export type SignInState = {
  email?: string;
  error?: string;
  fieldErrors?: Partial<Record<'email' | 'password', string>>;
};

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const parsed = schema.safeParse({ email, password: formData.get('password') });
  if (!parsed.success) {
    const fieldErrors: SignInState['fieldErrors'] = {};
    parsed.error.issues.forEach((issue) => {
      const key = issue.path[0] as 'email' | 'password';
      fieldErrors[key] ??= issue.message;
    });
    return { email, fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { email, error: toUserMessage(error) };

  redirect(safeNextPath(formData.get('next')));
}
