import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { getMetaStatus } from '@/lib/actions/integrations';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';
import { CrmTemplateForm, DisconnectButton, RefreshInstagramButton } from './AssetActions';
import { MetaWizard } from './MetaWizard';

const TYPE_LABEL: Record<string, string> = {
  page: 'Facebook sahifasi',
  instagram: 'Instagram',
  lead_form: 'Lid forma',
  ad_account: 'Reklama akkaunti',
  business: 'Biznes',
};
const ORDER = ['page', 'instagram', 'lead_form', 'ad_account', 'business'];

/** Mijoz → Integratsiyalar: what is connected for this client, and the Meta wizard to connect more. */
export async function IntegrationsTab({ clientId, clientName, meta }: { clientId: string; clientName: string; meta: { status?: string; connection?: string; message?: string; missing?: string } }) {
  const supabase = await createClient();
  const [status, assetsRes, connectionsRes, settingsRes, leadsRes] = await Promise.all([
    getMetaStatus(),
    supabase
      .from('meta_assets')
      .select('id, asset_type, external_id, name, status, webhook_subscribed_at, last_synced_at, sync_error, connection_id')
      .eq('client_id', clientId)
      .neq('status', 'disconnected'),
    supabase.from('meta_connections').select('id, name, status, token_expires_at').neq('status', 'disconnected').order('updated_at', { ascending: false }),
    supabase.from('client_crm_settings').select('template, auto_deliver').eq('client_id', clientId).maybeSingle(),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
  ]);
  if (assetsRes.error) throw assetsRes.error;
  const assets = [...(assetsRes.data ?? [])].sort((a, b) => ORDER.indexOf(a.asset_type) - ORDER.indexOf(b.asset_type));
  const connections = connectionsRes.data ?? [];
  const template = (settingsRes.data?.template as 'standard' | 'full' | undefined) ?? 'standard';
  const autoDeliver = settingsRes.data?.auto_deliver ?? false;
  const hasInstagram = assets.some((a) => a.asset_type === 'instagram');
  const connectionFromMeta = meta.status === 'connected' && meta.connection ? meta.connection : null;

  return (
    <div className="space-y-6">
      {meta.status === 'connected' ? (
        <Notice tone="success" title="Meta profili ulandi. Endi bu mijozga tegishli sahifa, Instagram va formalarni belgilang.">
          {meta.missing ? `Berilmagan ruxsatlar: ${meta.missing}. Kerak bo‘lsa qayta ulab, ularga ruxsat bering.` : null}
        </Notice>
      ) : null}
      {meta.status === 'cancelled' ? <Notice tone="warning" title="Meta’da ulanish bekor qilindi." /> : null}
      {meta.status === 'error' ? <Notice tone="danger" title={meta.message ?? 'Meta ulanishida xato.'} /> : null}

      <Card>
        <SectionTitle action={hasInstagram ? <RefreshInstagramButton clientId={clientId} /> : null}>Ulangan</SectionTitle>
        {assets.length === 0 ? (
          <p className="text-sm text-muted">Hali hech narsa ulanmagan. Pastdagi “Meta bilan ulanish” orqali boshlang.</p>
        ) : (
          <ul className="divide-y divide-line">
            {assets.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-56 flex-1">
                  <p className="text-sm font-medium">{a.name || a.external_id}</p>
                  <p className="text-[13px] text-muted">
                    {[
                      TYPE_LABEL[a.asset_type],
                      a.asset_type === 'page' ? (a.webhook_subscribed_at ? 'lidlar ulandi' : 'lid webhook ulanmagan') : null,
                      a.asset_type === 'instagram' ? (a.last_synced_at ? `yangilandi ${formatShortDateTime(a.last_synced_at)}` : 'birinchi yangilanish kutilmoqda') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {a.sync_error ? <p className="text-[13px] text-danger">{a.sync_error}</p> : null}
                </div>
                <Badge tone={a.status === 'error' ? 'danger' : 'success'} dot>
                  {a.status === 'error' ? 'Xato' : 'Faol'}
                </Badge>
                <DisconnectButton clientId={clientId} assetId={a.id} name={a.name || a.external_id} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-[13px] text-subtle">{`Bu mijozga jami ${leadsRes.count ?? 0} ta lid kelgan.`}</p>
      </Card>

      {assets.length > 0 ? (
        <Card>
          <SectionTitle>CRM shabloni</SectionTitle>
          <CrmTemplateForm clientId={clientId} template={template} autoDeliver={autoDeliver} />
        </Card>
      ) : null}

      <div>
        <h2 className="mb-3 text-[15px] font-semibold">Meta → Ulash</h2>
        {!status.deployed || !status.configured ? (
          <Notice tone="warning" title="Meta ilovasi serverda hali sozlanmagan">
            {status.deployed
              ? `Tizim egasi Supabase’da META_APP_ID va META_APP_SECRET sirlarini kiritgach, bu yerda “Facebook orqali ulash” paydo bo‘ladi. Meta ilovasida OAuth redirect: ${status.callback_url ?? '…/functions/v1/meta-connect'}, webhook: ${status.webhook_url ?? '…/functions/v1/meta-webhook'}.`
              : 'Meta Edge Function’lari (meta-connect, meta-webhook, meta-sync) hali deploy qilinmagan.'}
          </Notice>
        ) : (
          <MetaWizard
            clientId={clientId}
            clientName={clientName}
            connections={connections}
            initialConnectionId={connectionFromMeta}
            existing={assets.map((a) => `${a.asset_type}:${a.external_id}`)}
            template={template}
            autoDeliver={autoDeliver}
          />
        )}
      </div>
    </div>
  );
}
