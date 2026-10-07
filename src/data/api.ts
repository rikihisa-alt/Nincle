/**
 * データの読み書きの窓口。画面はここの Api だけを使う。
 * Supabase につながっていればサーバー版、未設定ならデモ版（端末の中だけで動く）になる。
 */
import type { DayUnit, OvertimeRule } from '@/lib/ninku';
import type {
  Answer,
  AssignmentRow,
  AttendanceHistoryRow,
  AttendanceRow,
  BusyDay,
  ClosingRow,
  InvitePreview,
  MessageReadRow,
  MessageRow,
  NotificationRow,
  ScheduleReplyRow,
  ScheduleRequestRow,
  SiteMemberRow,
  SiteRole,
  SiteRow,
  TeamRole,
  TeamRow,
  UserBrief,
  UserRow,
} from '@/lib/types';

export type TeamSummary = TeamRow & { memberCount: number; myRole: TeamRole };

export type TeamMember = { user_id: string; role: TeamRole; joined_at: string; user: UserBrief | null };

export type TeamDetail = { team: TeamRow; members: TeamMember[] };

export type SiteListItem = SiteRow & {
  team_name: string;
  my_role: SiteRole;
  member_count: number;
  unread: number;
};

export type SiteMember = SiteMemberRow & { user: UserBrief | null };

export type SiteDetail = {
  site: SiteRow;
  team: Pick<TeamRow, 'id' | 'name' | 'owner_user_id' | 'closing_day'>;
  members: SiteMember[];
  myRole: SiteRole | null;
};

export type RequestWithReplies = ScheduleRequestRow & { replies: ScheduleReplyRow[] };

export type PendingRequest = RequestWithReplies & { site_name: string };

export type NewSiteInput = {
  teamId: string;
  name: string;
  address: string;
  clientName: string;
  startDate: string;
  dueDate: string;
  defaultUnitPrice: number;
  overtimeRule: OvertimeRule;
  memo: string;
  memberIds: string[];
};

export type SitePatch = Partial<
  Pick<
    SiteRow,
    'name' | 'address' | 'client_name' | 'start_date' | 'due_date' | 'default_unit_price' | 'overtime_rule' | 'memo' | 'status'
  >
>;

export type NewRequestInput = {
  siteId: string;
  from: string;
  to: string;
  meetTime: string;
  note: string;
};

export type AttendanceInput = {
  siteId: string;
  userId: string;
  workDate: string;
  unit: DayUnit;
  overtimeHours: number;
};

export type PhotoInput = { uri: string; width?: number; height?: number };

export type ProfilePatch = Partial<
  Pick<
    UserRow,
    | 'display_name'
    | 'trade'
    | 'phone'
    | 'calendar_public'
    | 'notify_schedule_request'
    | 'notify_schedule_confirmed'
    | 'notify_due'
    | 'notify_chat'
  >
>;

export type DateRange = { from: string; to: string };

export interface Api {
  kind: 'supabase' | 'demo';

  // 自分
  getProfile(userId: string): Promise<UserRow | null>;
  updateProfile(userId: string, patch: ProfilePatch): Promise<void>;
  deleteAccount(): Promise<void>;
  listUsers(ids: string[]): Promise<UserBrief[]>;

  // チーム
  listMyTeams(userId: string): Promise<TeamSummary[]>;
  getTeam(teamId: string): Promise<TeamDetail | null>;
  createTeam(name: string): Promise<string>;
  updateTeam(teamId: string, patch: Partial<Pick<TeamRow, 'name' | 'closing_day'>>): Promise<void>;
  deleteTeam(teamId: string): Promise<void>;
  removeTeamMember(teamId: string, userId: string): Promise<void>;
  transferOwnership(teamId: string, userId: string): Promise<void>;
  createInvite(teamId: string, userId: string): Promise<string>;
  getInvitePreview(token: string): Promise<InvitePreview | null>;
  acceptInvite(token: string): Promise<string>;
  teamBusyDays(teamId: string, range: DateRange): Promise<BusyDay[]>;
  listClosings(teamId: string): Promise<ClosingRow[]>;
  closePeriod(teamId: string, start: string, end: string): Promise<void>;
  reopenPeriod(closingId: string): Promise<void>;

  // 現場
  listMySites(userId: string): Promise<SiteListItem[]>;
  getSite(siteId: string, userId: string): Promise<SiteDetail | null>;
  createSite(input: NewSiteInput): Promise<string>;
  updateSite(siteId: string, patch: SitePatch): Promise<void>;
  addSiteMembers(siteId: string, userIds: string[]): Promise<void>;
  removeSiteMember(siteId: string, userId: string): Promise<void>;
  updateSiteMember(siteId: string, userId: string, patch: Partial<Pick<SiteMemberRow, 'unit_price' | 'role'>>): Promise<void>;

  // やりとり
  listMessages(siteId: string): Promise<MessageRow[]>;
  listReads(siteId: string): Promise<MessageReadRow[]>;
  sendMessage(siteId: string, userId: string, body: string, photo?: PhotoInput): Promise<void>;
  photoUrls(paths: string[]): Promise<Record<string, string>>;
  markRead(siteId: string): Promise<void>;
  /** 新しい書き込みが来たら呼ぶ。戻り値で購読をやめる */
  subscribeSite(siteId: string, onChange: () => void): () => void;

  // 予定
  listRequests(siteId: string): Promise<RequestWithReplies[]>;
  listMyPendingRequests(userId: string): Promise<PendingRequest[]>;
  createRequest(userId: string, input: NewRequestInput): Promise<string>;
  reply(requestId: string, userId: string, answer: Answer): Promise<void>;
  nudge(requestId: string): Promise<number>;
  confirmSchedule(requestId: string, userIds: string[], dates: string[]): Promise<number>;
  closeRequest(requestId: string): Promise<void>;
  listAssignments(filter: DateRange & { userId?: string; siteIds?: string[] }): Promise<AssignmentRow[]>;
  addAssignment(siteId: string, userId: string, workDate: string): Promise<void>;
  deleteAssignment(id: string): Promise<void>;

  // 出面
  listAttendances(filter: DateRange & { userId?: string; siteIds?: string[] }): Promise<AttendanceRow[]>;
  upsertAttendance(input: AttendanceInput, enteredBy: string): Promise<void>;
  deleteAttendance(id: string): Promise<void>;
  approveAttendances(ids: string[]): Promise<void>;
  listAttendanceHistory(attendanceId: string): Promise<AttendanceHistoryRow[]>;

  // 通知
  listNotifications(userId: string): Promise<NotificationRow[]>;
  markNotificationsRead(userId: string, ids?: string[]): Promise<void>;
  subscribeNotifications(userId: string, onChange: () => void): () => void;
  savePushToken(userId: string, token: string, platform: 'ios' | 'android' | 'web'): Promise<void>;
}
