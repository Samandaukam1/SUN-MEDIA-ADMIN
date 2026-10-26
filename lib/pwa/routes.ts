/**
 * Where a notification (or an app shortcut) opens on the website. Notifications carry the phone app's routes
 * ("/chat/<room>", "/tasks/<id>", "/content/<id>"…); each account has its own area on the site (the panel, the staff
 * cabinet, the partner cabinet), so the same notification opens the right page for whoever clicks it. Pure: no
 * database, no Next.js — the /open route supplies what it knows.
 */

export type Area = '/panel' | '/xodim' | '/kabinet';

export type Target = {
  route: string;
  area: Area;
  /** The chat's kind, when the route is a chat ('project' rooms are client chats). */
  chatKind?: 'internal' | 'project' | 'direct' | null;
  /** The client a notification belongs to (the partner cabinet's chat opens by brand). */
  clientId?: string | null;
};

const ID = '([0-9a-fA-F-]{36})';
const q = (path: string, params: Record<string, string | null | undefined>) => {
  const search = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return search ? `${path}?${search}` : path;
};

export function webPath({ route, area, chatKind, clientId }: Target): string {
  const r = route.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const id = (re: string) => new RegExp(`^${re}$`).exec(r)?.[1] ?? null;

  const chat = id(`/chat/${ID}`);
  if (chat || r === '/chat') {
    if (area === '/kabinet') return q('/kabinet/chat', { brend: clientId });
    if (area === '/xodim') return q('/xodim/chat', { xona: chat });
    return q(chatKind === 'project' ? '/chat/mijozlar' : '/chat', { xona: chat });
  }

  const task = id(`/tasks?/${ID}`);
  if (task || r === '/tasks') {
    if (area === '/panel') return task ? `/work/tasks/${task}` : '/work/tasks';
    if (area === '/xodim') return task ? `/xodim/vazifa/${task}` : '/xodim';
    return '/kabinet';
  }

  const content = id(`/content/${ID}`);
  if (content || r === '/content') {
    if (area === '/panel') return content ? `/work/content/${content}` : '/work/content';
    return area === '/kabinet' ? '/kabinet/reja' : '/xodim';
  }

  const shooting = id(`/shootings/${ID}`);
  if (shooting) return area === '/panel' ? `/work/shootings/${shooting}` : area === '/kabinet' ? '/kabinet/reja' : '/xodim';

  if (r.startsWith('/approvals')) return area === '/panel' ? '/work/approvals' : area === '/kabinet' ? '/kabinet/reja' : '/xodim';
  if (r.startsWith('/reports')) return area === '/panel' ? '/reports' : area === '/kabinet' ? '/kabinet/hisobotlar' : '/xodim';
  if (r.startsWith('/crm/report')) return area === '/panel' ? '/crm/reports' : area === '/kabinet' ? '/kabinet/lidlar' : '/xodim';
  if (r.startsWith('/crm')) return area === '/panel' ? '/crm' : area === '/kabinet' ? '/kabinet/lidlar' : '/xodim';
  if (r.startsWith('/announcements')) return area === '/panel' ? '/workspace' : area === '/kabinet' ? '/kabinet' : '/xodim';
  if (r === '/plan' || r.startsWith('/plans')) return area === '/panel' ? '/plans' : area === '/kabinet' ? '/kabinet/tarif' : '/xodim';
  if (r.startsWith('/account')) return area === '/panel' ? '/profil' : area;
  if (area === '/panel' && ['/team/accounts', '/system/subscriptions', '/clients/games'].some((p) => r.startsWith(p))) {
    return r.startsWith('/clients/games') ? '/clients/games' : r;
  }
  // Anything else (an old or unknown route): the account's home, never a guessed page.
  return area;
}

/** A path the /open route may forward to: on this site, never another origin. */
export function safeRoute(value: string | null | undefined): string | null {
  if (!value || value.length > 300 || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value;
}
