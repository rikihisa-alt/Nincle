/**
 * DB の行の型（supabase/migrations と揃える）。
 * 日付は 'YYYY-MM-DD'、日時は ISO 文字列。
 * Supabase CLI を入れたら `supabase gen types typescript` の生成物と見比べる。
 */
import type { OvertimeRule } from './ninku.ts';

export type UserRow = {
  id: string;
  display_name: string;
  phone: string | null;
  trade: string | null;
  line_user_id: string | null;
  calendar_public: boolean;
  notify_schedule_request: boolean;
  notify_schedule_confirmed: boolean;
  notify_due: boolean;
  notify_chat: boolean;
  deleted_at: string | null;
  created_at: string;
};

export type UserBrief = Pick<UserRow, 'id' | 'display_name' | 'trade' | 'phone'>;

export type TeamRow = {
  id: string;
  name: string;
  owner_user_id: string;
  closing_day: number | null;
  created_at: string;
};

export type TeamRole = 'owner' | 'member';

export type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  joined_at: string;
};

export type TeamInviteRow = {
  id: string;
  team_id: string;
  token: string;
  created_by: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

export type InvitePreview = {
  team_id: string;
  team_name: string;
  owner_name: string;
  member_count: number;
  already_member: boolean;
};

export type SiteStatus = 'active' | 'completed' | 'archived';

export type SiteRow = {
  id: string;
  team_id: string;
  name: string;
  address: string | null;
  client_name: string | null;
  start_date: string;
  due_date: string;
  default_unit_price: number;
  overtime_rule: OvertimeRule;
  status: SiteStatus;
  memo: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  archived_at: string | null;
};

export type SiteRole = 'admin' | 'member';

export type SiteMemberRow = {
  id: string;
  site_id: string;
  user_id: string;
  role: SiteRole;
  unit_price: number | null;
  created_at: string;
};

export type MessageRow = {
  id: string;
  site_id: string;
  user_id: string;
  body: string;
  image_url: string | null;
  created_at: string;
};

export type MessageReadRow = {
  site_id: string;
  user_id: string;
  last_read_at: string;
};

export type Answer = 'yes' | 'no' | 'unknown';

export type ScheduleRequestRow = {
  id: string;
  site_id: string;
  created_by: string;
  target_date_from: string;
  target_date_to: string;
  meet_time: string | null;
  note: string | null;
  status: 'open' | 'closed';
  last_nudged_at: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export type ScheduleReplyRow = {
  id: string;
  request_id: string;
  user_id: string;
  answer: Answer;
  replied_at: string;
};

export type AssignmentRow = {
  id: string;
  site_id: string;
  user_id: string;
  work_date: string;
  request_id: string | null;
  meet_time: string | null;
  note: string | null;
  created_at: string;
};

export type DayUnitValue = 1 | 0.5;

export type AttendanceRow = {
  id: string;
  site_id: string;
  user_id: string;
  work_date: string;
  unit: DayUnitValue;
  overtime_hours: number;
  computed_ninku: number;
  unit_price: number;
  entered_by: string;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AttendanceHistoryRow = {
  id: string;
  attendance_id: string;
  site_id: string;
  user_id: string;
  work_date: string;
  unit: DayUnitValue;
  overtime_hours: number;
  computed_ninku: number;
  approved_at: string | null;
  operation: 'update' | 'delete';
  changed_by: string | null;
  changed_at: string;
};

export type NotificationType = 'schedule_request' | 'nudge' | 'assignment' | 'due_over' | 'message';

export type NotificationRow = {
  id: string;
  user_id: string;
  type: NotificationType;
  payload: { title?: string; body?: string; site_id?: string; request_id?: string };
  read_at: string | null;
  created_at: string;
};

export type ClosingRow = {
  id: string;
  team_id: string;
  period_start: string;
  period_end: string;
  closed_by: string | null;
  closed_at: string;
};

export type BusyDay = { user_id: string; work_date: string };
