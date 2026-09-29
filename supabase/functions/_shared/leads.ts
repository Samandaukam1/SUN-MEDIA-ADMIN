// Lead details from the Graph API into the lead row (used by the webhook right away and by meta-sync retries).
import { adminMessage, type Graph } from './meta.ts';
import { readToken, type Service } from './clients.ts';

export const LEAD_FIELDS = 'created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,is_organic';

export async function fetchLeadDetails(service: Service, graph: Graph, lead: { lead_id: string; meta_lead_id: string; page_asset_id: string | null }): Promise<boolean> {
  const token = await readToken(service, 'asset', lead.page_asset_id);
  if (!token) {
    await service.rpc('fail_meta_lead', { p_lead_id: lead.lead_id, p_error: 'Sahifa ulanmagan yoki tokeni yo‘q' });
    return false;
  }
  try {
    const details = await graph(lead.meta_lead_id, { fields: LEAD_FIELDS }, { token });
    const { error } = await service.rpc('complete_meta_lead', { p_lead_id: lead.lead_id, p_details: details });
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    await service.rpc('fail_meta_lead', { p_lead_id: lead.lead_id, p_error: adminMessage(e) });
    return false;
  }
}
