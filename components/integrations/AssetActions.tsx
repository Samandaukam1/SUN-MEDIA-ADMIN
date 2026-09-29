'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { disconnectMetaAsset, refreshInstagram, saveCrmTemplate } from '@/lib/actions/integrations';
import type { ActionState } from '@/lib/actions/state';

function Message({ state }: { state: ActionState | null }) {
  if (!state || state.status === 'idle') return null;
  return <span className={state.status === 'error' ? 'text-[13px] text-danger' : 'text-[13px] text-success'}>{state.status === 'error' ? state.message : state.message}</span>;
}

export function DisconnectButton({ clientId, assetId, name }: { clientId: string; assetId: string; name: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="md"
        variant="ghost"
        loading={pending}
        onClick={() => {
          if (window.confirm(`“${name}” uzilsinmi? Yangi lid va statistika kelmay qoladi; eski ma’lumotlar saqlanadi.`)) start(async () => setState(await disconnectMetaAsset(clientId, assetId)));
        }}
      >
        Uzish
      </Button>
      <Message state={state?.status === 'error' ? state : null} />
    </span>
  );
}

export function RefreshInstagramButton({ clientId }: { clientId: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Button size="md" variant="secondary" loading={pending} icon={<Icon name="refresh" size={16} />} onClick={() => start(async () => setState(await refreshInstagram(clientId)))}>
        Instagram’ni hozir yangilash
      </Button>
      <Message state={state} />
    </span>
  );
}

export function CrmTemplateForm({ clientId, template, autoDeliver }: { clientId: string; template: 'standard' | 'full'; autoDeliver: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);
  const [t, setT] = useState(template);
  const [auto, setAuto] = useState(autoDeliver);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={t === 'standard'} onChange={() => setT('standard')} />
          Standart (ism, telefon, kampaniya)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={t === 'full'} onChange={() => setT('full')} />
          To‘liq (barcha forma javoblari)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={auto} onChange={() => setAuto((v) => !v)} />
          Avtomatik yuborish
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button size="md" variant="secondary" loading={pending} onClick={() => start(async () => setState(await saveCrmTemplate(clientId, t, auto)))}>
          Shablonni saqlash
        </Button>
        <Message state={state} />
      </div>
    </div>
  );
}
