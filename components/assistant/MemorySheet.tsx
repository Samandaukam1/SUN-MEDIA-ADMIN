'use client';

import { useEffect, useState } from 'react';

type Note = { id: string; scope: 'personal' | 'company' | 'partner'; body: string; client: string | null; why: string; editable: boolean };

const GROUPS: [Note['scope'], string][] = [
  ['personal', 'Siz haqingizda'],
  ['company', 'Kompaniya qoidalari'],
  ['partner', 'Hamkor haqida'],
];

/**
 * Sunny's memory, inside its own panel (every audience that has one): what Sunny may use with this person, why, and —
 * for their own notes — correct or forget. The server and row-level security decide what is shown and what may change.
 */
export function MemorySheet({ onClose }: { onClose: () => void }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/assistant/memory', { cache: 'no-store' })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as { notes?: Note[]; error?: string };
        if (!live) return;
        if (!r.ok) setError(data.error ?? 'Xotirani o‘qib bo‘lmadi.');
        else setNotes(data.notes ?? []);
      })
      .catch(() => live && setError('Internet bilan bog‘lanib bo‘lmadi.'));
    return () => {
      live = false;
    };
  }, []);

  const call = async (method: 'PATCH' | 'DELETE', body: Record<string, string>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/assistant/memory', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await r.json().catch(() => ({}))) as { ok?: boolean; body?: string; error?: string };
      if (!r.ok || !data.ok) {
        setError(data.error ?? 'Saqlab bo‘lmadi.');
        return null;
      }
      return data;
    } catch {
      setError('Internet bilan bog‘lanib bo‘lmadi.');
      return null;
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!editing) return;
    const done = await call('PATCH', editing);
    if (!done) return;
    setNotes((list) => list?.map((n) => (n.id === editing.id ? { ...n, body: done.body ?? editing.body } : n)) ?? null);
    setEditing(null);
  };
  const forget = async (id: string) => {
    if (!(await call('DELETE', { id }))) return;
    setNotes((list) => list?.filter((n) => n.id !== id) ?? null);
    setAsking(null);
  };

  return (
    <div className="sb-mem" role="region" aria-label="Sunny xotirasi">
      <div className="sb-mem-head">
        <p className="sb-mem-title">Sunny xotirasi</p>
        <button type="button" className="sb-mem-back" onClick={onClose}>
          Suhbatga qaytish
        </button>
      </div>
      <p className="sb-mem-hint">Sunny faqat shu yerdagilarni eslaydi. O‘zingiznikini tuzatishingiz yoki o‘chirishingiz mumkin; chatda “eslab qol: …” deb qo‘shasiz.</p>
      {error ? (
        <p className="sb-mem-error" role="alert">
          {error}
        </p>
      ) : null}
      {!notes && !error ? <p className="sb-mem-hint">Yuklanmoqda…</p> : null}
      {notes && !notes.length ? <p className="sb-mem-hint">Hozircha hech narsa eslab qolinmagan.</p> : null}
      {GROUPS.map(([scope, title]) => {
        const list = notes?.filter((n) => n.scope === scope) ?? [];
        if (!list.length) return null;
        return (
          <section key={scope} className="sb-mem-group" aria-label={title}>
            <h3>{title}</h3>
            <ul>
              {list.map((n) => (
                <li key={n.id} className="sb-mem-item">
                  {editing?.id === n.id ? (
                    <>
                      <label className="sr-only" htmlFor={`mem-${n.id}`}>
                        Eslatmani tahrirlash
                      </label>
                      <textarea id={`mem-${n.id}`} value={editing.body} maxLength={400} rows={3} onChange={(e) => setEditing({ id: n.id, body: e.target.value })} autoFocus />
                      <div className="sb-mem-actions">
                        <button type="button" className="sb-confirm-yes" disabled={busy || editing.body.trim().length < 2} onClick={() => void save()}>
                          Saqlash
                        </button>
                        <button type="button" className="sb-confirm-no" disabled={busy} onClick={() => setEditing(null)}>
                          Bekor
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="sb-mem-body">
                        {n.body}
                        {n.client ? <span className="sb-mem-tag">{n.client}</span> : null}
                      </p>
                      <p className="sb-mem-why">{n.why}</p>
                      {n.editable ? (
                        asking === n.id ? (
                          <div className="sb-mem-actions" role="group" aria-label="O‘chirishni tasdiqlash">
                            <span>O‘chirilsinmi?</span>
                            <button type="button" className="sb-confirm-yes" disabled={busy} onClick={() => void forget(n.id)}>
                              Ha, o‘chir
                            </button>
                            <button type="button" className="sb-confirm-no" disabled={busy} onClick={() => setAsking(null)}>
                              Yo‘q
                            </button>
                          </div>
                        ) : (
                          <div className="sb-mem-actions">
                            <button type="button" className="sb-mem-link" onClick={() => setEditing({ id: n.id, body: n.body })} aria-label={`Tahrirlash: ${n.body}`}>
                              Tuzatish
                            </button>
                            <button type="button" className="sb-mem-link" onClick={() => setAsking(n.id)} aria-label={`Unutish: ${n.body}`}>
                              Unutish
                            </button>
                          </div>
                        )
                      ) : null}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
