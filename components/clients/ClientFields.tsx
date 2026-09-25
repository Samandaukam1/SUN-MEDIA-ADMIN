import { SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { CLIENT_STATUS } from '@/lib/labels';

export type ClientValues = {
  name?: string;
  code?: string;
  legal_name?: string | null;
  industry?: string | null;
  website?: string | null;
  address?: string | null;
  description?: string | null;
  status?: string;
};

/** Shared client form fields (create + edit). */
export function ClientFields({ values = {}, errors = {}, withStatus = false }: { values?: ClientValues; errors?: Record<string, string>; withStatus?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextInput label="Kompaniya nomi" name="name" required defaultValue={values.name} error={errors.name} placeholder="Masalan: SAFI" />
      <TextInput label="Qisqa kod" name="code" defaultValue={values.code} error={errors.code} hint="Kontent raqamlarida ishlatiladi (SAFI Reel #12). Bo‘sh qolsa nomdan olinadi." />
      <TextInput label="Yuridik nomi" name="legal_name" defaultValue={values.legal_name ?? ''} error={errors.legal_name} />
      <TextInput label="Soha" name="industry" defaultValue={values.industry ?? ''} error={errors.industry} placeholder="Restoran, retail, ta’lim…" />
      <TextInput label="Veb-sayt" name="website" type="url" defaultValue={values.website ?? ''} error={errors.website} placeholder="https://" />
      <TextInput label="Manzil" name="address" defaultValue={values.address ?? ''} error={errors.address} />
      {withStatus ? (
        <SelectInput label="Holat" name="status" defaultValue={values.status ?? 'active'}>
          {Object.entries(CLIENT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </SelectInput>
      ) : null}
      <div className="sm:col-span-2">
        <TextArea label="Izoh" name="description" defaultValue={values.description ?? ''} error={errors.description} placeholder="Brend, auditoriya, muhim eslatmalar" />
      </div>
    </div>
  );
}
