/**
 * デモ版の Api。Supabase 未設定のときに使う。データは端末のメモリの中だけ（再読み込みで元に戻る）。
 * 権限の決まりは supabase/migrations の RLS と同じにしてある。
 */
import type {
  Api,
  NewSiteInput,
  PendingRequest,
  RequestWithReplies,
  SiteDetail,
  SiteListItem,
  TeamDetail,
  TeamSummary,
} from '@/data/api';
import { addDays, todayJst } from '@/lib/date';
import { computeNinku, DEFAULT_OVERTIME_RULE } from '@/lib/ninku';
import type {
  AssignmentRow,
  AttendanceHistoryRow,
  AttendanceRow,
  ClosingRow,
  MessageReadRow,
  MessageRow,
  NotificationRow,
  ScheduleReplyRow,
  ScheduleRequestRow,
  SiteMemberRow,
  SiteRow,
  TeamInviteRow,
  TeamMemberRow,
  TeamRow,
  UserBrief,
  UserRow,
} from '@/lib/types';

type Store = {
  users: UserRow[];
  teams: TeamRow[];
  teamMembers: TeamMemberRow[];
  invites: TeamInviteRow[];
  sites: SiteRow[];
  siteMembers: SiteMemberRow[];
  messages: MessageRow[];
  reads: MessageReadRow[];
  requests: ScheduleRequestRow[];
  replies: ScheduleReplyRow[];
  assignments: AssignmentRow[];
  attendances: AttendanceRow[];
  histories: AttendanceHistoryRow[];
  notifications: NotificationRow[];
  closings: ClosingRow[];
};

let seq = 0;
const id = (prefix: string) => `${prefix}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const nowIso = () => new Date().toISOString();
/** 今日の hh:mm（日本時間）を ISO に */
const at = (ymd: string, hm: string) => new Date(`${ymd}T${hm.padStart(5, '0')}:00+09:00`).toISOString();

const DENIED = 'それはできません（権限がない）';

function user(idv: string, name: string, trade: string, phone: string | null): UserRow {
  return {
    id: idv,
    display_name: name,
    trade,
    phone,
    line_user_id: null,
    calendar_public: true,
    notify_schedule_request: true,
    notify_schedule_confirmed: true,
    notify_due: true,
    notify_chat: true,
    deleted_at: null,
    created_at: nowIso(),
  };
}

/** 今日を基準に、それらしい1か月分を作る */
function seed(): Store {
  const T = todayJst();
  const d = (n: number) => addDays(T, n);
  const users = [
    user('u1', '田中', '大工', '090-1111-2222'),
    user('u2', '西', '内装', '090-3333-4444'),
    user('u3', '森本', '電気', '080-5555-6666'),
    user('u4', '岡', '設備', '070-7777-8888'),
    user('u5', '山根', '塗装', null),
  ];
  const teams: TeamRow[] = [{ id: 't1', name: '塚本組', owner_user_id: 'u1', closing_day: null, created_at: nowIso() }];
  const teamMembers: TeamMemberRow[] = users.map((u, i) => ({
    id: `tm${i}`,
    team_id: 't1',
    user_id: u.id,
    role: u.id === 'u1' ? 'owner' : 'member',
    joined_at: nowIso(),
  }));
  const site = (p: Partial<SiteRow> & Pick<SiteRow, 'id' | 'name'>): SiteRow => ({
    team_id: 't1',
    address: null,
    client_name: null,
    start_date: d(-20),
    due_date: d(30),
    default_unit_price: 20000,
    overtime_rule: DEFAULT_OVERTIME_RULE,
    status: 'active',
    memo: null,
    created_by: 'u1',
    created_at: nowIso(),
    completed_at: null,
    archived_at: null,
    ...p,
  });
  const sites: SiteRow[] = [
    site({
      id: 's1',
      name: '塚本ハイツ 改修',
      address: '大阪市淀川区塚本2丁目',
      client_name: '丸和建設',
      start_date: d(-18),
      due_date: d(3),
      memo: '2F 内装・ボード貼り。駐車場は裏のコインパーキング（領収書もらう）',
    }),
    site({
      id: 's2',
      name: '豊中 戸建 新築',
      address: '豊中市岡町北1丁目',
      client_name: '北摂ホーム',
      start_date: d(-5),
      due_date: d(45),
      default_unit_price: 22000,
      created_by: 'u4',
    }),
    site({
      id: 's3',
      name: '此花 倉庫 改修',
      address: '大阪市此花区島屋4丁目',
      client_name: '丸和建設',
      start_date: d(-14),
      due_date: d(-2),
      status: 'completed',
      completed_at: at(d(-1), '17:00'),
    }),
    site({
      id: 's4',
      name: '西宮 店舗内装',
      address: '西宮市北口町',
      client_name: '阪神リフォーム',
      start_date: d(-80),
      due_date: d(-50),
      status: 'archived',
      archived_at: at(d(-45), '17:00'),
    }),
  ];
  const sm = (site_id: string, user_id: string, role: 'admin' | 'member' = 'member', unit_price: number | null = null) => ({
    id: id('sm'),
    site_id,
    user_id,
    role,
    unit_price,
    created_at: nowIso(),
  });
  const siteMembers: SiteMemberRow[] = [
    sm('s1', 'u1', 'admin'),
    sm('s1', 'u2'),
    sm('s1', 'u3', 'member', 21000),
    sm('s1', 'u4'),
    sm('s1', 'u5'),
    sm('s2', 'u4', 'admin'),
    sm('s2', 'u1'),
    sm('s3', 'u1', 'admin'),
    sm('s3', 'u2'),
    sm('s4', 'u1', 'admin'),
    sm('s4', 'u2'),
  ];

  const assignments: AssignmentRow[] = [];
  const attendances: AttendanceRow[] = [];
  const plan = (site_id: string, user_id: string, work_date: string, meet_time: string | null = '8:00', note: string | null = null) =>
    assignments.push({ id: id('as'), site_id, user_id, work_date, request_id: null, meet_time, note, created_at: nowIso() });
  const work = (site_id: string, user_id: string, work_date: string, unit: 1 | 0.5 = 1, ot = 0, approved = true) => {
    const s = sites.find((x) => x.id === site_id)!;
    const price = siteMembers.find((m) => m.site_id === site_id && m.user_id === user_id)?.unit_price ?? s.default_unit_price;
    attendances.push({
      id: id('at'),
      site_id,
      user_id,
      work_date,
      unit,
      overtime_hours: ot,
      computed_ninku: computeNinku(unit, ot, s.overtime_rule),
      unit_price: price,
      entered_by: user_id,
      approved_at: approved ? at(work_date, '19:00') : null,
      approved_by: approved ? 'u1' : null,
      created_at: at(work_date, '18:00'),
      updated_at: at(work_date, '18:00'),
    });
  };

  // 塚本：先週から田中・西・森本が入っている
  for (const n of [-6, -5, -4, -3, -1]) {
    const day = d(n);
    if (!day.startsWith(T.slice(0, 7)) && n < -3) continue;
    for (const u of ['u1', 'u2', 'u3']) {
      plan('s1', u, day, '8:00', '内装');
      work('s1', u, day, n === -1 && u === 'u2' ? 0.5 : 1, n === -4 && u === 'u3' ? 2 : 0, !(n === -4 && u === 'u3') && !(n === -1 && u !== 'u1'));
    }
  }
  for (const u of ['u1', 'u2', 'u3', 'u4']) plan('s1', u, T, '8:00', '2F 内装・ボード貼り');
  for (const u of ['u1', 'u2', 'u3']) plan('s1', u, d(1), '8:00', '2F ボード貼りの続き');
  // 豊中：岡が親で、田中が応援
  plan('s2', 'u4', d(-2), '7:30', '建方');
  plan('s2', 'u1', d(-2), '7:30', '建方応援');
  work('s2', 'u1', d(-2));
  work('s2', 'u4', d(-2));
  plan('s2', 'u4', d(2), '7:30', '建方');
  // 此花：完了（精算待ち）
  for (const n of [-9, -8]) {
    plan('s3', 'u2', d(n), '8:30', '解体');
    work('s3', 'u2', d(n));
  }

  const requests: ScheduleRequestRow[] = [
    {
      id: 'r1',
      site_id: 's1',
      created_by: 'u1',
      target_date_from: d(2),
      target_date_to: d(2),
      meet_time: '8:00',
      note: '配管が1日ずれたんで、ボード貼りを回します。入れる人おる？',
      status: 'open',
      last_nudged_at: null,
      confirmed_at: null,
      created_at: at(d(-1), '18:20'),
    },
    {
      id: 'r2',
      site_id: 's2',
      created_by: 'u4',
      target_date_from: d(3),
      target_date_to: d(4),
      meet_time: '7:30',
      note: '建方の応援お願いしたいです。2日間',
      status: 'open',
      last_nudged_at: null,
      confirmed_at: null,
      created_at: at(d(-1), '20:05'),
    },
  ];
  const replies: ScheduleReplyRow[] = [
    { id: id('rp'), request_id: 'r1', user_id: 'u1', answer: 'yes', replied_at: at(d(-1), '18:21') },
    { id: id('rp'), request_id: 'r1', user_id: 'u2', answer: 'yes', replied_at: at(d(-1), '18:40') },
    { id: id('rp'), request_id: 'r1', user_id: 'u3', answer: 'no', replied_at: at(d(-1), '19:02') },
  ];
  const messages: MessageRow[] = [
    { id: id('m'), site_id: 's1', user_id: 'u2', body: '2Fの石膏ボード、搬入終わってます', image_url: null, created_at: at(d(-1), '16:42') },
    { id: id('m'), site_id: 's1', user_id: 'u3', body: '配線の位置、今日中に墨出ししときます', image_url: null, created_at: at(d(-1), '17:10') },
    { id: id('m'), site_id: 's1', user_id: 'u1', body: '了解。明日は8時集合で', image_url: null, created_at: at(d(-1), '18:03') },
    { id: id('m'), site_id: 's1', user_id: 'u4', body: '配管の業者、明後日に変わりました', image_url: null, created_at: at(T, '7:12') },
    { id: id('m'), site_id: 's2', user_id: 'u4', body: '基礎の養生終わりました。建方は予定通り', image_url: null, created_at: at(d(-1), '19:50') },
  ];
  const reads: MessageReadRow[] = [
    { site_id: 's1', user_id: 'u1', last_read_at: at(d(-1), '18:05') },
    { site_id: 's1', user_id: 'u2', last_read_at: at(T, '7:20') },
    { site_id: 's1', user_id: 'u3', last_read_at: at(d(-1), '18:10') },
  ];
  const notifications: NotificationRow[] = [
    {
      id: id('n'),
      user_id: 'u1',
      type: 'schedule_request',
      payload: { site_id: 's2', request_id: 'r2', title: '豊中 戸建 新築：入れる？', body: '建方の応援。返事してください' },
      read_at: null,
      created_at: at(d(-1), '20:05'),
    },
    {
      id: id('n'),
      user_id: 'u1',
      type: 'message',
      payload: { site_id: 's1', title: '塚本ハイツ 改修', body: '岡：配管の業者、明後日に変わりました' },
      read_at: null,
      created_at: at(T, '7:12'),
    },
  ];
  return {
    users,
    teams,
    teamMembers,
    invites: [],
    sites,
    siteMembers,
    messages,
    reads,
    requests,
    replies,
    assignments,
    attendances,
    histories: [],
    notifications,
    closings: [],
  };
}

export type DemoApi = Api & {
  currentUserId(): string;
  setCurrentUser(userId: string): void;
  demoUsers(): UserBrief[];
};

export function createDemoApi(): DemoApi {
  const db = seed();
  let me = 'u1';
  const listeners = new Set<() => void>();
  const emit = () => setTimeout(() => listeners.forEach((l) => l()), 0);
  // 画面側で書き換えても元のデータが変わらないよう、複製して返す（通信の待ち時間も少しまねる）
  const wait = <T,>(v: T): Promise<T> =>
    new Promise((r) => setTimeout(() => r(v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T)), 120));

  const brief = (u: UserRow): UserBrief => ({ id: u.id, display_name: u.display_name, trade: u.trade, phone: u.phone });
  const isTeamMember = (teamId: string, uid = me) => db.teamMembers.some((m) => m.team_id === teamId && m.user_id === uid);
  const isTeamOwner = (teamId: string) => db.teamMembers.some((m) => m.team_id === teamId && m.user_id === me && m.role === 'owner');
  const isSiteMember = (siteId: string, uid = me) => db.siteMembers.some((m) => m.site_id === siteId && m.user_id === uid);
  const isSiteAdmin = (siteId: string) => db.siteMembers.some((m) => m.site_id === siteId && m.user_id === me && m.role === 'admin');
  const site = (siteId: string) => db.sites.find((s) => s.id === siteId);
  const writable = (siteId: string) => site(siteId)?.status !== 'archived';
  const sharesTeam = (uid: string) =>
    db.teamMembers.some((a) => a.user_id === me && db.teamMembers.some((b) => b.team_id === a.team_id && b.user_id === uid));
  const isClosed = (siteId: string, date: string) => {
    const teamId = site(siteId)?.team_id;
    return db.closings.some((c) => c.team_id === teamId && date >= c.period_start && date <= c.period_end);
  };
  const priceOf = (siteId: string, uid: string) =>
    db.siteMembers.find((m) => m.site_id === siteId && m.user_id === uid)?.unit_price ?? site(siteId)?.default_unit_price ?? 0;
  const deny = () => {
    throw new Error(DENIED);
  };
  const notify = (uid: string, type: NotificationRow['type'], payload: NotificationRow['payload']) => {
    if (uid === me && type !== 'due_over') return;
    db.notifications.unshift({ id: id('n'), user_id: uid, type, payload, read_at: null, created_at: nowIso() });
  };
  const visibleAttendance = (a: AttendanceRow) => a.user_id === me || isSiteAdmin(a.site_id);
  const repriceOpen = (siteId: string, uid?: string) => {
    for (const a of db.attendances) {
      if (a.site_id === siteId && (!uid || a.user_id === uid) && !isClosed(siteId, a.work_date)) {
        a.unit_price = priceOf(siteId, a.user_id);
      }
    }
  };
  const logHistory = (a: AttendanceRow, operation: 'update' | 'delete') =>
    db.histories.unshift({
      id: id('h'),
      attendance_id: a.id,
      site_id: a.site_id,
      user_id: a.user_id,
      work_date: a.work_date,
      unit: a.unit,
      overtime_hours: a.overtime_hours,
      computed_ninku: a.computed_ninku,
      approved_at: a.approved_at,
      operation,
      changed_by: me,
      changed_at: nowIso(),
    });

  const api: DemoApi = {
    kind: 'demo',
    currentUserId: () => me,
    setCurrentUser(uid) {
      me = uid;
      emit();
    },
    demoUsers: () => db.users.filter((u) => !u.deleted_at).map(brief),

    // ---------------- 自分 ----------------
    async getProfile(uid) {
      return wait(db.users.find((u) => u.id === uid) ?? null);
    },
    async updateProfile(uid, patch) {
      if (uid !== me) deny();
      Object.assign(db.users.find((u) => u.id === uid)!, patch);
      return wait(undefined);
    },
    async deleteAccount() {
      throw new Error('デモでは退会できません');
    },
    async listUsers(ids) {
      return wait(db.users.filter((u) => ids.includes(u.id) && (u.id === me || sharesTeam(u.id))).map(brief));
    },

    // ---------------- チーム ----------------
    async listMyTeams(uid) {
      return wait(
        db.teams
          .filter((t) => isTeamMember(t.id, uid))
          .map((t): TeamSummary => ({
            ...t,
            memberCount: db.teamMembers.filter((m) => m.team_id === t.id).length,
            myRole: db.teamMembers.find((m) => m.team_id === t.id && m.user_id === uid)?.role ?? 'member',
          })),
      );
    },
    async getTeam(teamId) {
      const team = db.teams.find((t) => t.id === teamId);
      if (!team || !isTeamMember(teamId)) return wait(null);
      const detail: TeamDetail = {
        team,
        members: db.teamMembers
          .filter((m) => m.team_id === teamId)
          .map((m) => ({ user_id: m.user_id, role: m.role, joined_at: m.joined_at, user: brief(db.users.find((u) => u.id === m.user_id)!) })),
      };
      return wait(detail);
    },
    async createTeam(name) {
      const t: TeamRow = { id: id('t'), name: name.trim(), owner_user_id: me, closing_day: null, created_at: nowIso() };
      db.teams.push(t);
      db.teamMembers.push({ id: id('tm'), team_id: t.id, user_id: me, role: 'owner', joined_at: nowIso() });
      return wait(t.id);
    },
    async updateTeam(teamId, patch) {
      if (!isTeamOwner(teamId)) deny();
      Object.assign(db.teams.find((t) => t.id === teamId)!, patch);
      return wait(undefined);
    },
    async deleteTeam(teamId) {
      if (!isTeamOwner(teamId)) deny();
      db.teams = db.teams.filter((t) => t.id !== teamId);
      db.teamMembers = db.teamMembers.filter((m) => m.team_id !== teamId);
      const siteIds = db.sites.filter((s) => s.team_id === teamId).map((s) => s.id);
      db.sites = db.sites.filter((s) => s.team_id !== teamId);
      db.siteMembers = db.siteMembers.filter((m) => !siteIds.includes(m.site_id));
      return wait(undefined);
    },
    async removeTeamMember(teamId, uid) {
      const m = db.teamMembers.find((x) => x.team_id === teamId && x.user_id === uid);
      if (!m || m.role === 'owner' || !(isTeamOwner(teamId) || uid === me)) deny();
      db.teamMembers = db.teamMembers.filter((x) => x !== m);
      return wait(undefined);
    },
    async transferOwnership(teamId, uid) {
      if (!isTeamOwner(teamId)) deny();
      if (!isTeamMember(teamId, uid)) throw new Error('チームの人にしか渡せません');
      for (const m of db.teamMembers) {
        if (m.team_id === teamId) m.role = m.user_id === uid ? 'owner' : 'member';
      }
      db.teams.find((t) => t.id === teamId)!.owner_user_id = uid;
      return wait(undefined);
    },
    async createInvite(teamId) {
      if (!isTeamOwner(teamId)) deny();
      const token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
      db.invites.push({
        id: id('inv'),
        team_id: teamId,
        token,
        created_by: me,
        expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
        revoked_at: null,
        created_at: nowIso(),
      });
      return wait(token);
    },
    async getInvitePreview(token) {
      const inv = db.invites.find((i) => i.token === token && !i.revoked_at && i.expires_at > nowIso());
      const team = inv && db.teams.find((t) => t.id === inv.team_id);
      if (!team) return wait(null);
      return wait({
        team_id: team.id,
        team_name: team.name,
        owner_name: db.users.find((u) => u.id === team.owner_user_id)?.display_name ?? '',
        member_count: db.teamMembers.filter((m) => m.team_id === team.id).length,
        already_member: isTeamMember(team.id),
      });
    },
    async acceptInvite(token) {
      const inv = db.invites.find((i) => i.token === token && !i.revoked_at && i.expires_at > nowIso());
      if (!inv) throw new Error('招待リンクが切れとるか、間違うとります');
      if (!isTeamMember(inv.team_id)) {
        db.teamMembers.push({ id: id('tm'), team_id: inv.team_id, user_id: me, role: 'member', joined_at: nowIso() });
      }
      return wait(inv.team_id);
    },
    async teamBusyDays(teamId, range) {
      if (!isTeamMember(teamId)) return wait([]);
      const publicIds = new Set(
        db.teamMembers
          .filter((m) => m.team_id === teamId)
          .map((m) => m.user_id)
          .filter((uid) => db.users.find((u) => u.id === uid)?.calendar_public),
      );
      const seen = new Set<string>();
      const out = db.assignments
        .filter((a) => publicIds.has(a.user_id) && a.work_date >= range.from && a.work_date <= range.to)
        .map((a) => ({ user_id: a.user_id, work_date: a.work_date }))
        .filter((b) => {
          const k = `${b.user_id}:${b.work_date}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      return wait(out);
    },
    async listClosings(teamId) {
      if (!isTeamMember(teamId)) return wait([]);
      return wait(db.closings.filter((c) => c.team_id === teamId).sort((a, b) => b.period_start.localeCompare(a.period_start)));
    },
    async closePeriod(teamId, start, end) {
      if (!isTeamOwner(teamId)) throw new Error('確定できるのは親方だけです');
      db.closings.push({ id: id('cl'), team_id: teamId, period_start: start, period_end: end, closed_by: me, closed_at: nowIso() });
      return wait(undefined);
    },
    async reopenPeriod(closingId) {
      const c = db.closings.find((x) => x.id === closingId);
      if (!c || !isTeamOwner(c.team_id)) throw new Error('確定を戻せるのは親方だけです');
      db.closings = db.closings.filter((x) => x !== c);
      return wait(undefined);
    },

    // ---------------- 現場 ----------------
    async listMySites(uid) {
      const out = db.sites
        .filter((s) => isSiteMember(s.id, uid))
        .map((s): SiteListItem => {
          const read = db.reads.find((r) => r.site_id === s.id && r.user_id === uid)?.last_read_at ?? '';
          return {
            ...s,
            team_name: db.teams.find((t) => t.id === s.team_id)?.name ?? '',
            my_role: db.siteMembers.find((m) => m.site_id === s.id && m.user_id === uid)!.role,
            member_count: db.siteMembers.filter((m) => m.site_id === s.id).length,
            unread: db.messages.filter((m) => m.site_id === s.id && m.user_id !== uid && m.created_at > read).length,
          };
        })
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
      return wait(out);
    },
    async getSite(siteId, uid) {
      const s = site(siteId);
      if (!s || !isSiteMember(siteId, uid)) return wait(null);
      const team = db.teams.find((t) => t.id === s.team_id)!;
      const members = db.siteMembers
        .filter((m) => m.site_id === siteId)
        .map((m) => ({ ...m, user: brief(db.users.find((u) => u.id === m.user_id)!) }))
        .sort((a, b) => (a.role === b.role ? a.created_at.localeCompare(b.created_at) : a.role === 'admin' ? -1 : 1));
      const detail: SiteDetail = {
        site: s,
        team: { id: team.id, name: team.name, owner_user_id: team.owner_user_id, closing_day: team.closing_day },
        members,
        myRole: members.find((m) => m.user_id === uid)?.role ?? null,
      };
      return wait(detail);
    },
    async createSite(input: NewSiteInput) {
      if (!isTeamMember(input.teamId)) throw new Error('このチームの人しか現場を作れません');
      const s: SiteRow = {
        id: id('s'),
        team_id: input.teamId,
        name: input.name.trim(),
        address: input.address || null,
        client_name: input.clientName || null,
        start_date: input.startDate,
        due_date: input.dueDate,
        default_unit_price: input.defaultUnitPrice,
        overtime_rule: input.overtimeRule,
        status: 'active',
        memo: input.memo || null,
        created_by: me,
        created_at: nowIso(),
        completed_at: null,
        archived_at: null,
      };
      db.sites.push(s);
      db.siteMembers.push({ id: id('sm'), site_id: s.id, user_id: me, role: 'admin', unit_price: null, created_at: nowIso() });
      for (const uid of input.memberIds) {
        if (uid !== me && isTeamMember(input.teamId, uid)) {
          db.siteMembers.push({ id: id('sm'), site_id: s.id, user_id: uid, role: 'member', unit_price: null, created_at: nowIso() });
        }
      }
      return wait(s.id);
    },
    async updateSite(siteId, patch) {
      if (!isSiteAdmin(siteId)) deny();
      const s = site(siteId)!;
      const before = { ...s };
      Object.assign(s, patch);
      if (patch.status && patch.status !== before.status) {
        s.completed_at = patch.status === 'completed' ? nowIso() : patch.status === 'active' ? null : before.completed_at;
        s.archived_at = patch.status === 'archived' ? nowIso() : null;
      }
      if (patch.default_unit_price !== undefined && patch.default_unit_price !== before.default_unit_price) repriceOpen(siteId);
      return wait(undefined);
    },
    async addSiteMembers(siteId, userIds) {
      if (!isSiteAdmin(siteId)) deny();
      const teamId = site(siteId)!.team_id;
      for (const uid of userIds) {
        if (isTeamMember(teamId, uid) && !isSiteMember(siteId, uid)) {
          db.siteMembers.push({ id: id('sm'), site_id: siteId, user_id: uid, role: 'member', unit_price: null, created_at: nowIso() });
        }
      }
      return wait(undefined);
    },
    async removeSiteMember(siteId, uid) {
      if (!isSiteAdmin(siteId) || uid === me) deny();
      db.siteMembers = db.siteMembers.filter((m) => !(m.site_id === siteId && m.user_id === uid));
      return wait(undefined);
    },
    async updateSiteMember(siteId, uid, patch) {
      if (!isSiteAdmin(siteId)) deny();
      Object.assign(db.siteMembers.find((m) => m.site_id === siteId && m.user_id === uid)!, patch);
      if (patch.unit_price !== undefined) repriceOpen(siteId, uid);
      return wait(undefined);
    },

    // ---------------- やりとり ----------------
    async listMessages(siteId) {
      if (!isSiteMember(siteId)) return wait([]);
      return wait(db.messages.filter((m) => m.site_id === siteId).sort((a, b) => a.created_at.localeCompare(b.created_at)));
    },
    async listReads(siteId) {
      if (!isSiteMember(siteId)) return wait([]);
      return wait(db.reads.filter((r) => r.site_id === siteId));
    },
    async sendMessage(siteId, uid, body, photo) {
      if (uid !== me || !isSiteMember(siteId) || !writable(siteId)) deny();
      const m: MessageRow = { id: id('m'), site_id: siteId, user_id: uid, body, image_url: photo?.uri ?? null, created_at: nowIso() };
      db.messages.push(m);
      const author = db.users.find((u) => u.id === uid)!.display_name;
      for (const x of db.siteMembers.filter((x) => x.site_id === siteId && x.user_id !== uid)) {
        notify(x.user_id, 'message', { site_id: siteId, title: site(siteId)!.name, body: `${author}：${body || '写真を送りました'}` });
      }
      emit();
      return wait(undefined);
    },
    async photoUrls(paths) {
      return Object.fromEntries(paths.map((p) => [p, p]));
    },
    async markRead(siteId) {
      if (!isSiteMember(siteId)) return;
      const r = db.reads.find((x) => x.site_id === siteId && x.user_id === me);
      if (r) r.last_read_at = nowIso();
      else db.reads.push({ site_id: siteId, user_id: me, last_read_at: nowIso() });
    },
    subscribeSite(_siteId, onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },

    // ---------------- 予定 ----------------
    async listRequests(siteId) {
      if (!isSiteMember(siteId)) return wait([]);
      return wait(
        db.requests
          .filter((r) => r.site_id === siteId)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((r): RequestWithReplies => ({ ...r, replies: db.replies.filter((x) => x.request_id === r.id) })),
      );
    },
    async listMyPendingRequests(uid) {
      return wait(
        db.requests
          .filter(
            (r) =>
              r.status === 'open' &&
              r.created_by !== uid &&
              isSiteMember(r.site_id, uid) &&
              writable(r.site_id) &&
              !db.replies.some((x) => x.request_id === r.id && x.user_id === uid),
          )
          .sort((a, b) => a.target_date_from.localeCompare(b.target_date_from))
          .map((r): PendingRequest => ({ ...r, replies: db.replies.filter((x) => x.request_id === r.id), site_name: site(r.site_id)!.name })),
      );
    },
    async createRequest(uid, input) {
      if (!isSiteAdmin(input.siteId) || !writable(input.siteId)) deny();
      const r: ScheduleRequestRow = {
        id: id('r'),
        site_id: input.siteId,
        created_by: uid,
        target_date_from: input.from,
        target_date_to: input.to,
        meet_time: input.meetTime || null,
        note: input.note || null,
        status: 'open',
        last_nudged_at: null,
        confirmed_at: null,
        created_at: nowIso(),
      };
      db.requests.push(r);
      for (const m of db.siteMembers.filter((x) => x.site_id === input.siteId && x.user_id !== uid)) {
        notify(m.user_id, 'schedule_request', { site_id: input.siteId, request_id: r.id, title: `${site(input.siteId)!.name}：入れる？`, body: '返事してください' });
      }
      return wait(r.id);
    },
    async reply(requestId, uid, answer) {
      const r = db.requests.find((x) => x.id === requestId);
      if (!r || uid !== me || !isSiteMember(r.site_id)) deny();
      if (r!.status !== 'open') throw new Error('この確認はもう締め切られています');
      const existing = db.replies.find((x) => x.request_id === requestId && x.user_id === uid);
      if (existing) Object.assign(existing, { answer, replied_at: nowIso() });
      else db.replies.push({ id: id('rp'), request_id: requestId, user_id: uid, answer, replied_at: nowIso() });
      return wait(undefined);
    },
    async nudge(requestId) {
      const r = db.requests.find((x) => x.id === requestId);
      if (!r || !isSiteAdmin(r.site_id)) throw new Error('つつけるのは現場の管理者だけです');
      if (r.last_nudged_at && Date.now() - new Date(r.last_nudged_at).getTime() < 30 * 60000) {
        throw new Error('さっきつついたばかりです。30分あけてください');
      }
      const targets = db.siteMembers.filter(
        (m) => m.site_id === r.site_id && m.user_id !== me && !db.replies.some((x) => x.request_id === requestId && x.user_id === m.user_id),
      );
      for (const m of targets) {
        notify(m.user_id, 'nudge', { site_id: r.site_id, request_id: r.id, title: `${site(r.site_id)!.name}：返事まだです`, body: '入れるか、返事してください' });
      }
      r.last_nudged_at = nowIso();
      return wait(targets.length);
    },
    async confirmSchedule(requestId, userIds, dates) {
      const r = db.requests.find((x) => x.id === requestId);
      if (!r || !isSiteAdmin(r.site_id)) throw new Error('予定を決められるのは現場の管理者だけです');
      let count = 0;
      for (const uid of userIds) {
        if (!isSiteMember(r.site_id, uid)) continue;
        const ds = dates.filter((x) => x >= r.target_date_from && x <= r.target_date_to);
        for (const work_date of ds) {
          const existing = db.assignments.find((a) => a.site_id === r.site_id && a.user_id === uid && a.work_date === work_date);
          if (existing) Object.assign(existing, { request_id: r.id, meet_time: r.meet_time, note: r.note?.slice(0, 200) ?? null });
          else
            db.assignments.push({
              id: id('as'),
              site_id: r.site_id,
              user_id: uid,
              work_date,
              request_id: r.id,
              meet_time: r.meet_time,
              note: r.note?.slice(0, 200) ?? null,
              created_at: nowIso(),
            });
          count++;
        }
        if (ds.length) notify(uid, 'assignment', { site_id: r.site_id, request_id: r.id, title: `${site(r.site_id)!.name}：予定が決まりました`, body: 'カレンダーに入れました' });
      }
      r.status = 'closed';
      r.confirmed_at = nowIso();
      return wait(count);
    },
    async closeRequest(requestId) {
      const r = db.requests.find((x) => x.id === requestId);
      if (!r || !isSiteAdmin(r.site_id)) deny();
      r!.status = 'closed';
      return wait(undefined);
    },
    async listAssignments(filter) {
      return wait(
        db.assignments
          .filter(
            (a) =>
              isSiteMember(a.site_id) &&
              a.work_date >= filter.from &&
              a.work_date <= filter.to &&
              (!filter.userId || a.user_id === filter.userId) &&
              (!filter.siteIds || filter.siteIds.includes(a.site_id)),
          )
          .sort((a, b) => a.work_date.localeCompare(b.work_date)),
      );
    },
    async addAssignment(siteId, uid, workDate) {
      if (!isSiteAdmin(siteId) || !writable(siteId)) deny();
      if (!db.assignments.some((a) => a.site_id === siteId && a.user_id === uid && a.work_date === workDate)) {
        db.assignments.push({ id: id('as'), site_id: siteId, user_id: uid, work_date: workDate, request_id: null, meet_time: null, note: null, created_at: nowIso() });
      }
      return wait(undefined);
    },
    async deleteAssignment(assignmentId) {
      const a = db.assignments.find((x) => x.id === assignmentId);
      if (!a || !isSiteAdmin(a.site_id)) deny();
      db.assignments = db.assignments.filter((x) => x.id !== assignmentId);
      return wait(undefined);
    },

    // ---------------- 出面 ----------------
    async listAttendances(filter) {
      return wait(
        db.attendances
          .filter(
            (a) =>
              visibleAttendance(a) &&
              a.work_date >= filter.from &&
              a.work_date <= filter.to &&
              (!filter.userId || a.user_id === filter.userId) &&
              (!filter.siteIds || filter.siteIds.includes(a.site_id)),
          )
          .sort((a, b) => a.work_date.localeCompare(b.work_date)),
      );
    },
    async upsertAttendance(input, enteredBy) {
      const s = site(input.siteId);
      if (!s || !isSiteMember(input.siteId) || !writable(input.siteId)) deny();
      const admin = isSiteAdmin(input.siteId);
      if (input.userId !== me && !admin) deny();
      if (isClosed(input.siteId, input.workDate)) throw new Error('確定済みの月の出面は直せません。親方に確定を戻してもらってください');
      const ninku = computeNinku(input.unit, input.overtimeHours, s!.overtime_rule);
      const existing = db.attendances.find(
        (a) => a.site_id === input.siteId && a.user_id === input.userId && a.work_date === input.workDate,
      );
      if (existing) {
        if (!admin && existing.approved_at) throw new Error('承認済みの出面は直せません。管理者に頼んでください');
        const changed = existing.unit !== input.unit || existing.overtime_hours !== input.overtimeHours;
        if (!changed) return wait(undefined);
        logHistory(existing, 'update');
        Object.assign(existing, {
          unit: input.unit,
          overtime_hours: input.overtimeHours,
          computed_ninku: ninku,
          entered_by: enteredBy,
          approved_at: admin ? nowIso() : null,
          approved_by: admin ? me : null,
          updated_at: nowIso(),
        });
      } else {
        db.attendances.push({
          id: id('at'),
          site_id: input.siteId,
          user_id: input.userId,
          work_date: input.workDate,
          unit: input.unit,
          overtime_hours: input.overtimeHours,
          computed_ninku: ninku,
          unit_price: priceOf(input.siteId, input.userId),
          entered_by: enteredBy,
          approved_at: admin ? nowIso() : null,
          approved_by: admin ? me : null,
          created_at: nowIso(),
          updated_at: nowIso(),
        });
      }
      return wait(undefined);
    },
    async deleteAttendance(attendanceId) {
      const a = db.attendances.find((x) => x.id === attendanceId);
      if (!a || !writable(a.site_id) || !(isSiteAdmin(a.site_id) || (a.user_id === me && !a.approved_at))) deny();
      if (isClosed(a!.site_id, a!.work_date)) throw new Error('確定済みの月の出面は消せません。親方に確定を戻してもらってください');
      logHistory(a!, 'delete');
      db.attendances = db.attendances.filter((x) => x !== a);
      return wait(undefined);
    },
    async approveAttendances(ids) {
      for (const aid of ids) {
        const a = db.attendances.find((x) => x.id === aid);
        if (!a || !isSiteAdmin(a.site_id)) deny();
        if (isClosed(a!.site_id, a!.work_date)) throw new Error('確定済みの月の出面は直せません');
        if (!a!.approved_at) {
          logHistory(a!, 'update');
          a!.approved_at = nowIso();
          a!.approved_by = me;
        }
      }
      return wait(undefined);
    },
    async listAttendanceHistory(attendanceId) {
      return wait(db.histories.filter((h) => h.attendance_id === attendanceId && (h.user_id === me || isSiteAdmin(h.site_id))));
    },

    // ---------------- 通知 ----------------
    async listNotifications(uid) {
      return wait(db.notifications.filter((n) => n.user_id === uid));
    },
    async markNotificationsRead(uid, ids) {
      for (const n of db.notifications) {
        if (n.user_id === uid && !n.read_at && (!ids || ids.includes(n.id))) n.read_at = nowIso();
      }
      return wait(undefined);
    },
    subscribeNotifications(_uid, onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    async savePushToken() {
      return wait(undefined);
    },
  };

  return api;
}
