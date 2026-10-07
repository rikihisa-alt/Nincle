import type { SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

import type {
  Api,
  PendingRequest,
  RequestWithReplies,
  SiteDetail,
  SiteListItem,
  SiteMember,
  TeamMember,
  TeamSummary,
} from '@/data/api';
import { preparePhoto } from '@/lib/photo';
import type {
  AssignmentRow,
  AttendanceHistoryRow,
  AttendanceRow,
  BusyDay,
  ClosingRow,
  InvitePreview,
  MessageReadRow,
  MessageRow,
  NotificationRow,
  SiteMemberRow,
  SiteRole,
  SiteRow,
  TeamRole,
  TeamRow,
  UserBrief,
  UserRow,
} from '@/lib/types';

const PHOTO_BUCKET = 'site-photos';

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

/** numeric 列が文字列で返ってきても数値にそろえる */
function normAttendance(a: AttendanceRow): AttendanceRow {
  return {
    ...a,
    unit: Number(a.unit) as AttendanceRow['unit'],
    overtime_hours: Number(a.overtime_hours),
    computed_ninku: Number(a.computed_ninku),
  };
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSupabaseApi(sb: SupabaseClient): Api {
  return {
    kind: 'supabase',

    // ---------------- 自分 ----------------
    async getProfile(userId) {
      return check(await sb.from('users').select('*').eq('id', userId).maybeSingle<UserRow>());
    },
    async updateProfile(userId, patch) {
      check(await sb.from('users').update(patch).eq('id', userId));
    },
    async deleteAccount() {
      check(await sb.rpc('delete_account'));
      await sb.auth.signOut();
    },
    async listUsers(ids) {
      if (!ids.length) return [];
      return check(await sb.from('users').select('id, display_name, trade, phone').in('id', ids)) as UserBrief[];
    },

    // ---------------- チーム ----------------
    async listMyTeams(userId) {
      const rows = check(
        await sb.from('teams').select('*, team_members(user_id, role)').order('created_at'),
      ) as (TeamRow & { team_members: { user_id: string; role: TeamRole }[] })[];
      return rows.map(({ team_members, ...team }): TeamSummary => ({
        ...team,
        memberCount: team_members.length,
        myRole: team_members.find((m) => m.user_id === userId)?.role ?? 'member',
      }));
    },
    async getTeam(teamId) {
      const [team, members] = await Promise.all([
        sb.from('teams').select('*').eq('id', teamId).maybeSingle<TeamRow>(),
        sb
          .from('team_members')
          .select('user_id, role, joined_at, user:users(id, display_name, trade, phone)')
          .eq('team_id', teamId)
          .order('joined_at')
          .returns<TeamMember[]>(),
      ]);
      const t = check(team);
      if (!t) return null;
      return { team: t, members: check(members) ?? [] };
    },
    async createTeam(name) {
      return check(await sb.rpc('create_team', { p_name: name })) as string;
    },
    async updateTeam(teamId, patch) {
      check(await sb.from('teams').update(patch).eq('id', teamId));
    },
    async deleteTeam(teamId) {
      check(await sb.from('teams').delete().eq('id', teamId));
    },
    async removeTeamMember(teamId, userId) {
      check(await sb.from('team_members').delete().eq('team_id', teamId).eq('user_id', userId));
    },
    async transferOwnership(teamId, userId) {
      check(await sb.rpc('transfer_team_ownership', { p_team_id: teamId, p_new_owner: userId }));
    },
    async createInvite(teamId, userId) {
      const row = check(
        await sb.from('team_invites').insert({ team_id: teamId, created_by: userId }).select('token').single<{ token: string }>(),
      );
      return row!.token;
    },
    async getInvitePreview(token) {
      const rows = check(await sb.rpc('get_invite_preview', { p_token: token })) as InvitePreview[] | null;
      return rows?.[0] ?? null;
    },
    async acceptInvite(token) {
      return check(await sb.rpc('accept_invite', { p_token: token })) as string;
    },
    async teamBusyDays(teamId, range) {
      return check(
        await sb.rpc('team_busy_days', { p_team_id: teamId, p_from: range.from, p_to: range.to }),
      ) as BusyDay[];
    },
    async listClosings(teamId) {
      return check(
        await sb.from('closings').select('*').eq('team_id', teamId).order('period_start', { ascending: false }),
      ) as ClosingRow[];
    },
    async closePeriod(teamId, start, end) {
      check(await sb.rpc('close_period', { p_team_id: teamId, p_start: start, p_end: end }));
    },
    async reopenPeriod(closingId) {
      check(await sb.rpc('reopen_period', { p_closing_id: closingId }));
    },

    // ---------------- 現場 ----------------
    async listMySites(userId) {
      const [sites, unread] = await Promise.all([
        sb.from('sites').select('*, teams(name), site_members(user_id, role)').order('due_date'),
        sb.rpc('my_unread_counts'),
      ]);
      const counts = new Map(
        ((check(unread) as { site_id: string; unread: number }[] | null) ?? []).map((r) => [r.site_id, Number(r.unread)]),
      );
      const rows = check(sites) as (SiteRow & {
        teams: { name: string } | null;
        site_members: { user_id: string; role: SiteRole }[];
      })[];
      return rows.map(({ teams, site_members, ...site }): SiteListItem => ({
        ...site,
        team_name: teams?.name ?? '',
        my_role: site_members.find((m) => m.user_id === userId)?.role ?? 'member',
        member_count: site_members.length,
        unread: counts.get(site.id) ?? 0,
      }));
    },
    async getSite(siteId, userId) {
      const row = check(
        await sb
          .from('sites')
          .select('*, team:teams(id, name, owner_user_id, closing_day), site_members(*, user:users(id, display_name, trade, phone))')
          .eq('id', siteId)
          .maybeSingle(),
      ) as (SiteRow & { team: SiteDetail['team']; site_members: SiteMember[] }) | null;
      if (!row) return null;
      const { team, site_members, ...site } = row;
      const members = [...site_members].sort((a, b) =>
        a.role === b.role ? a.created_at.localeCompare(b.created_at) : a.role === 'admin' ? -1 : 1,
      );
      return { site, team, members, myRole: members.find((m) => m.user_id === userId)?.role ?? null };
    },
    async createSite(input) {
      const id = check(
        await sb.rpc('create_site', {
          p_team_id: input.teamId,
          p_name: input.name,
          p_address: input.address || null,
          p_client_name: input.clientName || null,
          p_start_date: input.startDate,
          p_due_date: input.dueDate,
          p_default_unit_price: input.defaultUnitPrice,
          p_member_ids: input.memberIds,
        }),
      ) as string;
      check(await sb.from('sites').update({ overtime_rule: input.overtimeRule, memo: input.memo || null }).eq('id', id));
      return id;
    },
    async updateSite(siteId, patch) {
      check(await sb.from('sites').update(patch).eq('id', siteId));
    },
    async addSiteMembers(siteId, userIds) {
      if (!userIds.length) return;
      check(await sb.from('site_members').insert(userIds.map((user_id) => ({ site_id: siteId, user_id, role: 'member' }))));
    },
    async removeSiteMember(siteId, userId) {
      check(await sb.from('site_members').delete().eq('site_id', siteId).eq('user_id', userId));
    },
    async updateSiteMember(siteId, userId, patch: Partial<Pick<SiteMemberRow, 'unit_price' | 'role'>>) {
      check(await sb.from('site_members').update(patch).eq('site_id', siteId).eq('user_id', userId));
    },

    // ---------------- やりとり ----------------
    async listMessages(siteId) {
      const rows = check(
        await sb.from('messages').select('*').eq('site_id', siteId).order('created_at', { ascending: false }).limit(300),
      ) as MessageRow[];
      return rows.reverse();
    },
    async listReads(siteId) {
      return check(await sb.from('message_reads').select('*').eq('site_id', siteId)) as MessageReadRow[];
    },
    async sendMessage(siteId, userId, body, photo) {
      let path: string | null = null;
      if (photo) {
        const prepared = await preparePhoto(
          photo.uri,
          photo.width && photo.height ? { width: photo.width, height: photo.height } : undefined,
        );
        const bytes = await (await fetch(prepared.uri)).arrayBuffer();
        path = `${siteId}/${randomId()}.jpg`;
        check(await sb.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: 'image/jpeg' }));
      }
      check(await sb.from('messages').insert({ site_id: siteId, user_id: userId, body, image_url: path }));
    },
    async photoUrls(paths) {
      if (!paths.length) return {};
      const rows = check(await sb.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60)) as {
        path: string | null;
        signedUrl: string;
      }[];
      return Object.fromEntries(rows.filter((r) => r.path).map((r) => [r.path as string, r.signedUrl]));
    },
    async markRead(siteId) {
      check(await sb.rpc('mark_site_read', { p_site_id: siteId }));
    },
    subscribeSite(siteId, onChange) {
      const channel = sb
        .channel(`site:${siteId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `site_id=eq.${siteId}` }, onChange)
        .subscribe();
      return () => {
        sb.removeChannel(channel);
      };
    },

    // ---------------- 予定 ----------------
    async listRequests(siteId) {
      return check(
        await sb
          .from('schedule_requests')
          .select('*, replies:schedule_replies(*)')
          .eq('site_id', siteId)
          .order('created_at', { ascending: false }),
      ) as RequestWithReplies[];
    },
    async listMyPendingRequests(userId) {
      const rows = check(
        await sb
          .from('schedule_requests')
          .select('*, replies:schedule_replies(*), site:sites(name, status)')
          .eq('status', 'open')
          .neq('created_by', userId)
          .order('target_date_from'),
      ) as (RequestWithReplies & { site: { name: string; status: string } | null })[];
      return rows
        .filter((r) => r.site?.status !== 'archived' && !r.replies.some((x) => x.user_id === userId))
        .map(({ site, ...r }): PendingRequest => ({ ...r, site_name: site?.name ?? '' }));
    },
    async createRequest(userId, input) {
      const row = check(
        await sb
          .from('schedule_requests')
          .insert({
            site_id: input.siteId,
            created_by: userId,
            target_date_from: input.from,
            target_date_to: input.to,
            meet_time: input.meetTime || null,
            note: input.note || null,
          })
          .select('id')
          .single<{ id: string }>(),
      );
      return row!.id;
    },
    async reply(requestId, userId, answer) {
      check(
        await sb
          .from('schedule_replies')
          .upsert(
            { request_id: requestId, user_id: userId, answer, replied_at: new Date().toISOString() },
            { onConflict: 'request_id,user_id' },
          ),
      );
    },
    async nudge(requestId) {
      return check(await sb.rpc('nudge_schedule_request', { p_request_id: requestId })) as number;
    },
    async confirmSchedule(requestId, userIds, dates) {
      return check(
        await sb.rpc('confirm_schedule', { p_request_id: requestId, p_user_ids: userIds, p_dates: dates }),
      ) as number;
    },
    async closeRequest(requestId) {
      check(await sb.from('schedule_requests').update({ status: 'closed' }).eq('id', requestId));
    },
    async listAssignments(filter) {
      let q = sb.from('assignments').select('*').gte('work_date', filter.from).lte('work_date', filter.to);
      if (filter.userId) q = q.eq('user_id', filter.userId);
      if (filter.siteIds) q = q.in('site_id', filter.siteIds);
      return check(await q.order('work_date')) as AssignmentRow[];
    },
    async addAssignment(siteId, userId, workDate) {
      check(
        await sb
          .from('assignments')
          .upsert(
            { site_id: siteId, user_id: userId, work_date: workDate },
            { onConflict: 'site_id,user_id,work_date', ignoreDuplicates: true },
          ),
      );
    },
    async deleteAssignment(id) {
      check(await sb.from('assignments').delete().eq('id', id));
    },

    // ---------------- 出面 ----------------
    async listAttendances(filter) {
      let q = sb.from('attendances').select('*').gte('work_date', filter.from).lte('work_date', filter.to);
      if (filter.userId) q = q.eq('user_id', filter.userId);
      if (filter.siteIds) q = q.in('site_id', filter.siteIds);
      return (check(await q.order('work_date')) as AttendanceRow[]).map(normAttendance);
    },
    async upsertAttendance(input, enteredBy) {
      check(
        await sb.from('attendances').upsert(
          {
            site_id: input.siteId,
            user_id: input.userId,
            work_date: input.workDate,
            unit: input.unit,
            overtime_hours: input.overtimeHours,
            // 人工はサーバーで計算し直す（ここは仮の値）
            computed_ninku: input.unit,
            entered_by: enteredBy,
          },
          { onConflict: 'site_id,user_id,work_date' },
        ),
      );
    },
    async deleteAttendance(id) {
      check(await sb.from('attendances').delete().eq('id', id));
    },
    async approveAttendances(ids) {
      if (!ids.length) return;
      check(await sb.from('attendances').update({ approved_at: new Date().toISOString() }).in('id', ids));
    },
    async listAttendanceHistory(attendanceId) {
      return (
        check(
          await sb
            .from('attendance_histories')
            .select('*')
            .eq('attendance_id', attendanceId)
            .order('changed_at', { ascending: false }),
        ) as AttendanceHistoryRow[]
      ).map((h) => ({ ...h, unit: Number(h.unit) as AttendanceHistoryRow['unit'], overtime_hours: Number(h.overtime_hours), computed_ninku: Number(h.computed_ninku) }));
    },

    // ---------------- 通知 ----------------
    async listNotifications(userId) {
      return check(
        await sb
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(100),
      ) as NotificationRow[];
    },
    async markNotificationsRead(userId, ids) {
      let q = sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null);
      if (ids) q = q.in('id', ids);
      check(await q);
    },
    subscribeNotifications(userId, onChange) {
      const channel = sb
        .channel(`notifications:${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, onChange)
        .subscribe();
      return () => {
        sb.removeChannel(channel);
      };
    },
    async savePushToken(userId, token, platform) {
      check(
        await sb
          .from('push_tokens')
          .upsert({ token, user_id: userId, platform, updated_at: new Date().toISOString() }, { onConflict: 'token' }),
      );
    },
  };
}

/** 招待リンクの URL（本番は https のドメイン、開発中はアプリのリンク） */
export function inviteUrl(token: string): string {
  const base = process.env.EXPO_PUBLIC_INVITE_BASE_URL;
  if (base) return `${base.replace(/\/$/, '')}/invite/${token}`;
  return Linking.createURL(`/invite/${token}`);
}
