'use client';

import { useActionState } from 'react';

import { SelectInput, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { updateStaffProfile } from '@/lib/actions/accounts';
import { idle, type ActionState } from '@/lib/actions/state';
import { EMPLOYEE_STATUS, EMPLOYMENT_TYPE } from '@/lib/labels';

type Props = {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  jobTitle: string | null;
  department: string | null;
  employmentType: string;
  employeeStatus: string;
  editable: boolean;
};

export function StaffProfileForm(props: Props) {
  const [state, action] = useActionState<ActionState, FormData>(updateStaffProfile, idle);
  const errors = state.status === 'error' ? state.fieldErrors ?? {} : {};
  const disabled = !props.editable;
  return (
    <form action={action} className="space-y-6">
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      {state.status === 'success' ? <Notice tone="success" title={state.message} /> : null}
      <input type="hidden" name="user_id" value={props.userId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Ism" name="first_name" defaultValue={props.firstName} required disabled={disabled} error={errors.first_name} />
        <TextInput label="Familiya" name="last_name" defaultValue={props.lastName} required disabled={disabled} error={errors.last_name} />
        <TextInput label="Telefon" name="phone" type="tel" defaultValue={props.phone ?? ''} disabled={disabled} error={errors.phone} />
        <TextInput label="Lavozim" name="job_title" defaultValue={props.jobTitle ?? ''} disabled={disabled} error={errors.job_title} />
        <TextInput label="Bo‘lim" name="department" defaultValue={props.department ?? ''} disabled={disabled} />
        <SelectInput label="Ish holati" name="employment_type" defaultValue={props.employmentType} disabled={disabled}>
          {Object.entries(EMPLOYMENT_TYPE).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </SelectInput>
        <SelectInput label="Xodim holati" name="employee_status" defaultValue={props.employeeStatus} disabled={disabled}>
          {Object.entries(EMPLOYEE_STATUS).map(([v, s]) => (
            <option key={v} value={v}>
              {s.label}
            </option>
          ))}
        </SelectInput>
      </div>
      {props.editable ? (
        <div className="flex justify-end">
          <SubmitButton>Saqlash</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
