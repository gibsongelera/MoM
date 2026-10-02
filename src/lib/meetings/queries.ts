import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersonOption } from '@/lib/types/domain';

/** Columns every meeting view needs (people, type, status, schedule). */
export const MEETING_COLUMNS =
  'id, title, starts_at, duration_min, venue, status, meeting_type, sub_type, project_title, agenda, ' +
  'is_emergency, guests, chairperson_name, chairperson_id, panel_members, adviser_name, adviser_id, ' +
  'department_id, secretary_id, chair_id, ai_processed, meeting_participants(user_id)';

/** Active accounts in a department, as picker suggestions. */
export async function departmentPeople(supabase: SupabaseClient, departmentId: string | null): Promise<PersonOption[]> {
  if (!departmentId) return [];
  const { data } = await supabase
    .from('profiles')
    .select('id, name, position, role')
    .eq('department_id', departmentId)
    .eq('active', true)
    .order('name');
  return (data as PersonOption[] | null) ?? [];
}

/** The department head (approving chair), mirroring sm_department_head(). */
export async function departmentHead(supabase: SupabaseClient, departmentId: string | null): Promise<PersonOption | null> {
  if (!departmentId) return null;
  const { data: dept } = await supabase.from('departments').select('head_id').eq('id', departmentId).maybeSingle();
  if (dept?.head_id) {
    const { data } = await supabase.from('profiles').select('id, name, position, role').eq('id', dept.head_id).eq('active', true).maybeSingle();
    if (data) return data as PersonOption;
  }
  const { data } = await supabase
    .from('profiles')
    .select('id, name, position, role')
    .eq('department_id', departmentId)
    .eq('role', 'head')
    .eq('active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  return (data as PersonOption | null) ?? null;
}

/** Capstone / research sub-types from the reference table, in display order. */
export async function meetingSubtypes(supabase: SupabaseClient): Promise<Record<'capstone' | 'research', string[]>> {
  const { data } = await supabase.from('meeting_subtypes').select('meeting_type, label').order('position');
  const out: Record<'capstone' | 'research', string[]> = { capstone: [], research: [] };
  for (const row of (data as { meeting_type: string; label: string }[] | null) ?? []) {
    if (row.meeting_type === 'capstone' || row.meeting_type === 'research') out[row.meeting_type].push(row.label);
  }
  return out;
}
