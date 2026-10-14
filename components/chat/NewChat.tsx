'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { createGroupChat, openDirectChat } from '@/lib/actions/chat';

type Colleague = { id: string; name: string; role: string };

/** "Yangi suhbat" (one colleague) and "Yangi guruh" (a name and several colleagues). */
export function NewChat({ colleagues, base = '/chat' }: { colleagues: Colleague[]; base?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'direct' | 'group' | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? colleagues.filter((c) => `${c.name} ${c.role}`.toLowerCase().includes(q)) : colleagues;
  }, [query, colleagues]);
  const close = () => {
    setMode(null);
    setQuery('');
    setPicked([]);
    setName('');
    setError(null);
  };
  const go = (roomId?: string) => {
    close();
    if (roomId) router.push(`${base}?xona=${roomId}`);
  };

  return (
    <>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => setMode('direct')}>
          Yangi suhbat
        </Button>
        <Button type="button" variant="secondary" onClick={() => setMode('group')}>
          Yangi guruh
        </Button>
      </div>
      <Dialog open={mode !== null} onClose={close} title={mode === 'group' ? 'Yangi guruh' : 'Yangi suhbat'} description={mode === 'group' ? 'Guruh nomi va a’zolarini tanlang.' : 'Kim bilan yozishasiz?'}>
        <div className="space-y-3">
          {mode === 'group' ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Guruh nomi, masalan: Syomka jamoasi"
              className="h-11 w-full rounded-xl border border-line bg-surface px-4 text-[15px] outline-none focus:border-accent"
            />
          ) : null}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ism yoki lavozim bo‘yicha qidirish"
            className="h-11 w-full rounded-xl border border-line bg-surface px-4 text-[15px] outline-none focus:border-accent"
          />
          <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {shown.map((c) => {
              const on = picked.includes(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (mode === 'group') setPicked(on ? picked.filter((x) => x !== c.id) : [...picked, c.id]);
                      else
                        start(async () => {
                          const res = await openDirectChat(c.id);
                          if (res.ok) go(res.roomId);
                          else setError(res.message);
                        });
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2 ${on ? 'bg-surface-2' : ''}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px] font-medium">{c.name}</span>
                      <span className="block truncate text-[12.5px] text-muted">{c.role}</span>
                    </span>
                    {mode === 'group' ? (
                      <span className={`grid size-5 shrink-0 place-items-center rounded-md border ${on ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong'}`}>{on ? '✓' : ''}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
            {shown.length === 0 ? <li className="px-4 py-6 text-center text-[13.5px] text-muted">Hech kim topilmadi.</li> : null}
          </ul>
          {error ? <p className="text-[13px] text-danger">{error}</p> : null}
          {mode === 'group' ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-muted">{picked.length} kishi tanlandi</span>
              <Button
                type="button"
                loading={pending}
                disabled={!name.trim() || picked.length === 0}
                onClick={() =>
                  start(async () => {
                    const res = await createGroupChat(name, picked);
                    if (res.ok) go(res.roomId);
                    else setError(res.message);
                  })
                }
              >
                Guruh yaratish
              </Button>
            </div>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
