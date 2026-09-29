import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/panel/PageHeader';
import { ContentForm } from '@/components/work/ContentForm';
import { saveContentAction } from '@/lib/actions/work';
import { requirePermission } from '@/lib/auth';
import { loadClients, loadStaff } from '@/lib/directory';
import { createClient } from '@/lib/supabase/server';
import { toLocalInput } from '@/lib/time';

export const metadata: Metadata = { title: 'Kontentni tahrirlash' };

export default async function EditContentPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('content.manage');
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: c }, clients, staff] = await Promise.all([
    supabase
      .from('content_items')
      .select('id, title, client_id, project_id, content_type, priority, due_at, client_approval_due_at, description, script, caption, is_client_visible, team:content_assignments(role, user_id), publications:content_publications(platform, scheduled_at, status)')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
    loadClients(),
    loadStaff(),
  ]);
  if (!c) notFound();
  const live = c.publications.filter((p) => p.status !== 'cancelled');
  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Ish jarayoni', href: '/work/content' }, { label: 'Kontent', href: '/work/content' }, { label: c.title, href: `/work/content/${c.id}` }, { label: 'Tahrirlash' }]}
        title="Kontentni tahrirlash"
      />
      <ContentForm
        action={saveContentAction.bind(null, c.id)}
        clients={clients}
        staff={staff}
        editing
        cancelHref={`/work/content/${c.id}`}
        defaults={{
          clientId: c.client_id,
          projectId: c.project_id,
          title: c.title,
          contentType: c.content_type,
          priority: c.priority,
          platforms: live.map((p) => p.platform),
          dueAt: toLocalInput(c.due_at),
          approvalDueAt: toLocalInput(c.client_approval_due_at),
          publishAt: toLocalInput(live.find((p) => p.scheduled_at)?.scheduled_at),
          description: c.description,
          script: c.script,
          caption: c.caption,
          isClientVisible: c.is_client_visible,
          team: Object.fromEntries(c.team.map((t) => [t.role, t.user_id])),
        }}
      />
    </div>
  );
}
