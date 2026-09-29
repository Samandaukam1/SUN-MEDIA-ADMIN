import type { IconName } from '@/components/ui/Icon';

/** What the client components receive: only the pages this person may open (section href = first page). */
export type VisibleSection = { key: string; label: string; icon: IconName; href: string; pages: { href: string; label: string }[] };

/** The section and page a path belongs to: the longest page href that prefixes it ('/' only matches itself). */
export function locate(sections: VisibleSection[], pathname: string) {
  let best: { section: VisibleSection; page: VisibleSection['pages'][number] } | null = null;
  for (const section of sections) {
    for (const page of section.pages) {
      const hit = page.href === '/' ? pathname === '/' : pathname === page.href || pathname.startsWith(`${page.href}/`);
      if (hit && (!best || page.href.length > best.page.href.length)) best = { section, page };
    }
  }
  return best;
}
