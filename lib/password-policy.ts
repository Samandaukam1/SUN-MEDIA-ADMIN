/**
 * Password rules shared by the server (final say) and the "change password" form (live hints), plus the
 * temporary password generator. No Node or browser APIs here: the random source is passed in.
 */

export const PASSWORD_MIN = 10;
/** bcrypt (Supabase Auth) only looks at the first 72 bytes. */
export const PASSWORD_MAX = 72;

const COMMON = ['password', 'parol', 'qwerty', '123456', '111111', 'sunmedia', 'admin', 'iloveyou', 'abc123'];

/** Why a new password is not acceptable, or null when it is. */
export function passwordProblem(password: string, opts: { email?: string | null; previous?: string | null } = {}): string | null {
  if (password.length < PASSWORD_MIN) return `Parol kamida ${PASSWORD_MIN} ta belgidan iborat bo‘lsin.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return `Parol ${PASSWORD_MAX} belgidan oshmasin.`;
  if (/\s/.test(password)) return 'Parolda bo‘sh joy bo‘lmasin.';
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return 'Parolda harf ham, raqam ham bo‘lsin.';
  if (new Set(password.toLowerCase()).size < 5) return 'Parol juda oddiy: turli belgilar ko‘proq bo‘lsin.';
  const lower = password.toLowerCase();
  if (COMMON.some((word) => lower.includes(word))) return 'Parol juda oson topiladi. Boshqa so‘z tanlang.';
  const login = opts.email?.split('@')[0]?.toLowerCase() ?? '';
  if (login.length >= 4 && lower.includes(login)) return 'Parolda login (email) bo‘lmasin.';
  if (opts.previous && password === opts.previous) return 'Yangi parol eskisidan farq qilsin.';
  return null;
}

// Ambiguous characters (0/O, 1/l/I) are left out so a password can be dictated over the phone.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?';
const BODY = UPPER + LOWER + DIGITS;

/**
 * Temporary password like "Xk7p-Rm4q-Wz9t!": three groups of four from 56 characters (≈70 bits) with at least one
 * capital, one small letter and one digit, plus a symbol. `randomInt(n)` must be a CSPRNG returning 0…n-1.
 */
export function generateTemporaryPassword(randomInt: (max: number) => number): string {
  for (;;) {
    const body = Array.from({ length: 12 }, () => BODY[randomInt(BODY.length)]).join('');
    if (!/[A-Z]/.test(body) || !/[a-z]/.test(body) || !/\d/.test(body)) continue;
    return `${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8)}${SYMBOLS[randomInt(SYMBOLS.length)]}`;
  }
}
