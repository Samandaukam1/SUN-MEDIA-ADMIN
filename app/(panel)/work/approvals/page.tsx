import { redirect } from 'next/navigation';

// The approval queue is gone: clients only follow, and internal checks are a content stage ("Ichki tekshiruv").
export default function RetiredApprovalsPage() {
  redirect('/work/content?stage=check');
}
