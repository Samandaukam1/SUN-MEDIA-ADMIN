/** "fb" / "ig" as Meta reports where the lead form was shown. */
export function platformLabel(platform: string | null | undefined): string | null {
  if (!platform) return null;
  const p = platform.toLowerCase();
  if (p === 'ig' || p === 'instagram') return 'Instagram';
  if (p === 'fb' || p === 'facebook') return 'Facebook';
  if (p === 'msg' || p === 'messenger') return 'Messenger';
  return platform;
}

/** Form question keys ("qaysi_filial") as readable labels ("Qaysi filial"). */
export function fieldLabel(key: string): string {
  const text = key.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const CRM_REPORT_KIND: Record<string, string> = { weekly: '7 kunlik', monthly: '30 kunlik', custom: 'Maxsus muddat' };

export type CrmReportData = {
  period_start: string;
  period_end: string;
  days: number;
  total: number;
  delivered: number;
  pending: number;
  daily_average: number;
  by_campaign: { name: string; count: number }[];
  top_ads: { name: string; campaign: string | null; count: number }[];
  daily: { date: string; count: number }[];
  weekly: { week_start: string; count: number }[];
};
