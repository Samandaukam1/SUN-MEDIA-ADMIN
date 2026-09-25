import { z } from 'zod';

export const myContextSchema = z.object({
  status: z.enum(['active', 'pending', 'disabled']),
  kind: z.enum(['staff', 'client']).nullable().optional(),
  interface: z.enum(['client', 'employee', 'management']).nullable().optional(),
  profile: z
    .object({
      id: z.string(),
      full_name: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      avatar_url: z.string().nullable(),
      locale: z.string(),
    })
    .optional(),
  roles: z.array(z.object({ key: z.string(), name: z.string() })).default([]),
  employee: z
    .object({ job_title: z.string().nullable(), department: z.string().nullable(), status: z.string() })
    .nullable()
    .optional(),
  permissions: z.array(z.string()).default([]),
  clients: z
    .array(z.object({ id: z.string(), name: z.string(), code: z.string(), role: z.string(), role_name: z.string(), permissions: z.array(z.string()) }))
    .default([]),
});

export type MyContext = z.infer<typeof myContextSchema>;
export type StaffContext = MyContext & { userId: string };
