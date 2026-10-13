import 'server-only';

import { redirect } from 'next/navigation';

import { getSessionContext } from '@/lib/auth';
import type { StaffContext } from '@/types/app';
import { homeFor, isPanelUser } from './routing';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PartnerScope = {
  context: StaffContext;
  clientId: string;
  /** SUN MEDIA staff looking at the partner's view from the panel: read-only. */
  preview: boolean;
  /** "?brend=…" to keep on links between sections (only when the person has a choice or is previewing). */
  brandQuery: string;
  home: string;
  roleLabel: string;
  /** Client permissions of this person for this brand (empty for staff previews). */
  permissions: string[];
};

/**
 * Which brand this cabinet page shows. A partner only ever gets one of its own memberships (`?brend=` picks among
 * them); panel staff may preview a brand from the panel. The database checks the same thing again on every read.
 */
export async function resolvePartner(brand: unknown): Promise<PartnerScope> {
  const context = await getSessionContext();
  if (!context) redirect('/');
  const home = homeFor(context);
  if (!home) redirect('/no-access');
  if (context.temporary_password) redirect('/parol');

  if (context.kind === 'client') {
    const membership = context.clients.find((c) => c.id === brand) ?? context.clients[0];
    if (!membership) redirect('/no-access');
    return {
      context,
      clientId: membership.id,
      preview: false,
      brandQuery: context.clients.length > 1 ? `brend=${membership.id}` : '',
      home,
      roleLabel: `${membership.role_name} · ${membership.name}`,
      permissions: membership.permissions,
    };
  }
  if (isPanelUser(context) && typeof brand === 'string' && UUID.test(brand)) {
    return {
      context,
      clientId: brand,
      preview: true,
      brandQuery: `brend=${brand}`,
      home,
      roleLabel: `${context.roles.map((r) => r.name).join(', ')} · ko‘rish rejimi`,
      permissions: [],
    };
  }
  redirect(home);
}

/** "/kabinet/lidlar" + the brand (and any extra query). */
export function partnerHref(scope: Pick<PartnerScope, 'brandQuery'>, path: string, extra: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams(scope.brandQuery);
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
