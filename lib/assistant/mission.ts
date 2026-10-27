/**
 * Mission mode (§29): one request, several actions. Whatever the model writes, the person also gets the system's own
 * account of every change it attempted — done, not done (and why), or waiting for their click — so a mission that
 * partly failed can never read as a success. Pure functions.
 */

export type MissionStep = { label: string; state: 'done' | 'failed' | 'waiting'; text: string };

const NAMES: Record<string, string> = {
  check_in: 'Davomat',
  create_task: 'Vazifa',
  update_task: 'Vazifa o‘zgarishi',
  set_content_status: 'Kontent holati',
  send_message: 'Xabar',
  edit_message: 'Xabar tahriri',
  delete_message: 'Xabarni o‘chirish',
  create_shooting: 'S’yomka',
  remember: 'Eslatma',
  forget: 'Eslatmani o‘chirish',
  client_note: 'Mijoz eslatmasi',
  company_rule: 'Kompaniya qoidasi',
  teach_style: 'Uslub namunasi',
  set_personality: 'Sozlama',
};

/** One change, as the action tool reported it ({holat, xabar, amal}); null when the content is not an action's report. */
export function stepOf(name: string, content: string): MissionStep | null {
  let r: { holat?: string; xabar?: string; amal?: string };
  try {
    r = JSON.parse(content);
  } catch {
    return null;
  }
  if (!r || typeof r !== 'object' || !r.holat) return null;
  const label = NAMES[name] ?? name;
  if (r.holat === 'TASDIQ KUTILMOQDA') return { label, state: 'waiting', text: `${r.amal ?? 'Amal'} Tasdiqlash tugmasini bosing.` };
  return { label, state: r.holat === 'BAJARILDI' ? 'done' : 'failed', text: r.xabar ?? (r.holat === 'BAJARILDI' ? 'bajarildi' : 'bajarilmadi') };
}

const MARK = { done: '✅', failed: '❌', waiting: '⏳' } as const;
const clip = (s: string, n = 180) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The account of a mission: empty for fewer than two changes (a single action speaks for itself). */
export function missionLedger(steps: MissionStep[]): string {
  if (steps.length < 2) return '';
  const count = (s: MissionStep['state']) => steps.filter((x) => x.state === s).length;
  const parts = [
    `${count('done')} ta bajarildi`,
    count('failed') ? `${count('failed')} ta bajarilmadi` : '',
    count('waiting') ? `${count('waiting')} ta tasdiqingizni kutmoqda` : '',
  ].filter(Boolean);
  const lines = steps.map((s) => `${MARK[s.state]} ${s.label}: ${clip(s.text.replace(/\s+/g, ' ').trim())}`);
  return [`Natija — ${parts.join(', ')}:`, ...lines].join('\n');
}
