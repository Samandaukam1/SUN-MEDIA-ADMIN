import { addDaysToKey, addMonthsToKey, agencyDateKey, isDateKey, monthStartKey } from '@/lib/time';

/** The month a page shows (?month=YYYY-MM-01, default this month) and its first/last day. */
export function monthFrom(param: string | undefined) {
  const current = monthStartKey(agencyDateKey());
  const month = isDateKey(param) && monthStartKey(param) <= current ? monthStartKey(param) : current;
  return { month, current, from: month, to: addDaysToKey(addMonthsToKey(month, 1), -1) };
}
