/** sessionStorage that never throws (private mode, blocked storage): the widget simply forgets. */
export function stored(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
export function store(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

/** localStorage, the same way: for choices that outlive a visit (Sunny's reminders, today's rituals). */
export function kept(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function keep(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}
