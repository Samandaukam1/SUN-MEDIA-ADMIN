import { z } from 'zod';

const nullableString = z.string().nullable().optional();

export const commandCenterSchema = z.object({
  date: z.string(),
  tasks: z.object({ total: z.number(), completed: z.number(), in_progress: z.number(), todo: z.number(), overdue: z.number() }),
  shootings: z.array(
    z.object({
      id: z.string(),
      starts_at: z.string(),
      ends_at: z.string(),
      title: z.string(),
      status: z.string(),
      client_name: z.string(),
      location_name: nullableString,
      members: z.array(z.object({ user_id: z.string(), full_name: z.string(), role: nullableString, attendance: nullableString })),
    }),
  ),
  attendance: z.object({
    employees: z.number(),
    present: z.number(),
    late: z.number(),
    absent: z.number(),
    excused: z.number(),
    vacation: z.number(),
    remote: z.number(),
    unmarked: z.number(),
    people: z.array(
      z.object({ user_id: z.string(), full_name: z.string(), job_title: nullableString, status: nullableString, late_minutes: z.number().nullable().optional() }),
    ),
  }),
  approvals: z.object({
    client_review: z.number(),
    internal_review: z.number(),
    items: z.array(z.object({ content_id: z.string(), label: z.string(), status: z.string(), client_name: z.string(), since: z.string(), due_at: nullableString })),
  }),
  overdue: z.array(z.object({ task_id: z.string(), title: z.string(), due_at: z.string(), client_name: nullableString, assignees: z.array(z.string()) })),
  publications: z.object({
    scheduled: z.number(),
    published: z.number(),
    items: z.array(z.object({ publication_id: z.string(), label: z.string(), platform: z.string(), scheduled_at: z.string(), status: z.string(), client_name: z.string() })),
  }),
});

export type CommandCenter = z.infer<typeof commandCenterSchema>;
