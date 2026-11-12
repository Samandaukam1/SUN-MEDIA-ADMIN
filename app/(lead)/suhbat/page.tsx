import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { Interview } from '@/components/brief/Interview';
import { interviewView } from '@/lib/actions/brief-client';
import { KIOSK_COOKIE } from '@/lib/supabase/middleware';

export const metadata: Metadata = {
  title: 'Suhbat — SUN MEDIA',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export const dynamic = 'force-dynamic';
// The answer after a client's own words may wait for a short AI classification; the report runs after the reply.
export const maxDuration = 300;

/** The client's interview: full screen, the session's own key only (cookie), no staff navigation or data. */
export default async function InterviewPage() {
  const [view, jar] = await Promise.all([interviewView(), cookies()]);
  return <Interview initial={view} kiosk={jar.has(KIOSK_COOKIE)} />;
}
