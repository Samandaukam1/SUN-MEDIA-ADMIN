import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { Stage, WorkflowRole } from './workflow-shared';

export type Skill = { id: string; name: string; workflowRole: WorkflowRole | null };
export type Person = { id: string; name: string; jobTitle: string | null; skills: Skill[] };

export async function loadSkills(): Promise<Skill[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('skills').select('id, name, workflow_role').order('position').order('name');
  if (error) throw error;
  return data.map((s) => ({ id: s.id, name: s.name, workflowRole: (s.workflow_role as WorkflowRole | null) ?? null }));
}

/** Active employees with their skills (for picking people by what they can do). */
export async function loadPeople(): Promise<Person[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, status, employee:employees!inner(job_title, status, skills:employee_skills(skill:skills(id, name, workflow_role)))')
    .is('deleted_at', null)
    .eq('status', 'active')
    .order('full_name');
  if (error) throw error;
  return data
    .filter((p) => p.employee && p.employee.status !== 'terminated')
    .map((p) => ({
      id: p.id,
      name: p.full_name,
      jobTitle: p.employee?.job_title ?? null,
      skills: (p.employee?.skills ?? [])
        .map((s) => s.skill)
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => ({ id: s.id, name: s.name, workflowRole: (s.workflow_role as WorkflowRole | null) ?? null })),
    }));
}

export type StageTask = {
  id: string;
  stage: Stage;
  status: string;
  title: string;
  dueAt: string | null;
  updatedAt: string;
  assignees: { id: string; name: string }[];
};

export type EquipmentLine = { id: string; name: string; preparedAt: string | null; preparedBy: string | null };

export async function loadWorkflow(contentId: string): Promise<{ stages: StageTask[]; equipment: EquipmentLine[] }> {
  const supabase = await createClient();
  const [tasks, equipment] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, stage, status, title, due_at, updated_at, assignees:task_assignments(person:profiles!task_assignments_user_id_fkey(id, full_name))')
      .eq('content_id', contentId)
      .not('stage', 'is', null)
      .is('deleted_at', null),
    supabase
      .from('content_equipment')
      .select('equipment_id, prepared_at, item:equipment(name), by:profiles!content_equipment_prepared_by_fkey(full_name)')
      .eq('content_id', contentId),
  ]);
  if (tasks.error) throw tasks.error;
  if (equipment.error) throw equipment.error;
  return {
    stages: tasks.data.map((t) => ({
      id: t.id,
      stage: t.stage as Stage,
      status: t.status,
      title: t.title,
      dueAt: t.due_at,
      updatedAt: t.updated_at,
      assignees: t.assignees.map((a) => a.person).filter((p): p is NonNullable<typeof p> => !!p).map((p) => ({ id: p.id, name: p.full_name })),
    })),
    equipment: equipment.data
      .map((e) => ({ id: e.equipment_id, name: e.item?.name ?? '—', preparedAt: e.prepared_at, preparedBy: e.by?.full_name ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
