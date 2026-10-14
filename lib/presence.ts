/** A person is online while their page beats (every minute); two quiet minutes means offline. */
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function isOnline(lastSeen: string | null | undefined, now = Date.now()): boolean {
  return !!lastSeen && now - new Date(lastSeen).getTime() < ONLINE_WINDOW_MS;
}

/** "12 daqiqa oldin", "3 soat oldin", "2 kun oldin". */
export function lastSeenLabel(lastSeen: string | null | undefined, now = Date.now()): string {
  if (!lastSeen) return 'Hali kirmagan';
  const minutes = Math.max(1, Math.round((now - new Date(lastSeen).getTime()) / 60000));
  if (minutes < 60) return `${minutes} daqiqa oldin`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} soat oldin`;
  return `${Math.round(hours / 24)} kun oldin`;
}
