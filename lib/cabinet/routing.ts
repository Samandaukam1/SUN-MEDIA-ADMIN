/**
 * Where a signed-in account belongs. Decided only from the account's own context (roles and permissions read
 * from the database); the button pressed on the site or a URL never changes it.
 */

export type RoutingContext = {
  status: 'active' | 'pending' | 'disabled';
  kind?: 'staff' | 'client' | null;
  roles: { key: string }[];
  permissions: string[];
  temporary_password?: boolean | null;
};

export type Home = '/panel' | '/xodim' | '/kabinet';

/** Permissions that open the web panel (management); other staff get their own cabinet. */
const PANEL_PERMISSIONS = ['dashboard.view', 'employees.manage', 'clients.manage'];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);

export function isPanelUser(context: RoutingContext): boolean {
  return (
    context.kind === 'staff' &&
    (context.roles.some((r) => r.key === 'system_owner') || PANEL_PERMISSIONS.some((p) => context.permissions.includes(p)))
  );
}

/** The account's own home, or null when it may not sign in to the website (blocked, no role yet). */
export function homeFor(context: RoutingContext | null | undefined): Home | null {
  if (!context || context.status !== 'active') return null;
  if (context.kind === 'staff') return isPanelUser(context) ? '/panel' : '/xodim';
  if (context.kind === 'client') return '/kabinet';
  return null;
}

/** A same-origin path, or null. */
export function cleanNext(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\') || value === '/') return null;
  return value;
}

/** A requested page is only honoured inside the account's own area. */
function allowed(home: Home, path: string): boolean {
  if (['/login', '/parol', '/auth'].some((p) => under(path, p))) return false;
  if (home === '/kabinet') return under(path, '/kabinet');
  if (home === '/xodim') return under(path, '/xodim');
  return !under(path, '/xodim') && !under(path, '/kabinet');
}

/** After signing in: the temporary password is replaced first, then the requested page (if theirs) or home. */
export function destinationFor(context: RoutingContext | null | undefined, next?: unknown): string | null {
  const home = homeFor(context);
  if (!home) return null;
  if (context?.temporary_password) return '/parol';
  const path = cleanNext(next);
  return path && allowed(home, path) ? path : home;
}
