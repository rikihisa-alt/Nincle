/**
 * 人工の集計。画面とCSVはすべてここの結果を使う。
 * 予定人工は「確定予定（assignments）の数 × 1.0人工」で数える。
 */
import { ninkuAmount, sumNinku } from './ninku.ts';
import { inPeriod } from './period.ts';
import type { AssignmentRow, AttendanceRow, SiteRow, UserBrief } from './types.ts';

export type Range = { start: string; end: string };

export type SiteTotal = {
  siteId: string;
  siteName: string;
  actual: number;
  planned: number;
  amount: number;
  /** 単価の表示用（人によって違えば最小〜最大） */
  priceMin: number;
  priceMax: number;
  memberIds: string[];
};

export type MemberTotal = {
  userId: string;
  name: string;
  trade: string | null;
  actual: number;
  planned: number;
  amount: number;
  days: number;
  pending: number;
};

export type Summary = {
  actual: number;
  planned: number;
  amount: number;
  pendingCount: number;
  bySite: SiteTotal[];
  byMember: MemberTotal[];
};

export function summarize(input: {
  range: Range;
  sites: Pick<SiteRow, 'id' | 'name'>[];
  users: UserBrief[];
  attendances: AttendanceRow[];
  assignments: Pick<AssignmentRow, 'site_id' | 'user_id' | 'work_date'>[];
  /** 絞り込み（指定がなければ全部） */
  siteId?: string | null;
  userId?: string | null;
}): Summary {
  const keep = (row: { site_id: string; user_id: string; work_date: string }) =>
    inPeriod(row.work_date, input.range) &&
    (!input.siteId || row.site_id === input.siteId) &&
    (!input.userId || row.user_id === input.userId);
  const atts = input.attendances.filter(keep);
  const plans = input.assignments.filter(keep);
  const name = (id: string) => input.users.find((u) => u.id === id);

  const bySite: SiteTotal[] = input.sites
    .map((s) => {
      const rows = atts.filter((a) => a.site_id === s.id);
      const prices = rows.map((a) => a.unit_price);
      return {
        siteId: s.id,
        siteName: s.name,
        actual: sumNinku(rows.map((a) => a.computed_ninku)),
        planned: plans.filter((p) => p.site_id === s.id).length,
        amount: rows.reduce((sum, a) => sum + ninkuAmount(a.computed_ninku, a.unit_price), 0),
        priceMin: prices.length ? Math.min(...prices) : 0,
        priceMax: prices.length ? Math.max(...prices) : 0,
        memberIds: [...new Set(rows.map((a) => a.user_id))],
      };
    })
    .filter((s) => s.actual > 0 || s.planned > 0)
    .sort((a, b) => b.actual - a.actual || b.planned - a.planned);

  const userIds = [...new Set([...atts.map((a) => a.user_id), ...plans.map((p) => p.user_id)])];
  const byMember: MemberTotal[] = userIds
    .map((id) => {
      const rows = atts.filter((a) => a.user_id === id);
      const u = name(id);
      return {
        userId: id,
        name: u?.display_name || '（名前なし）',
        trade: u?.trade ?? null,
        actual: sumNinku(rows.map((a) => a.computed_ninku)),
        planned: plans.filter((p) => p.user_id === id).length,
        amount: rows.reduce((sum, a) => sum + ninkuAmount(a.computed_ninku, a.unit_price), 0),
        days: new Set(rows.map((a) => a.work_date)).size,
        pending: rows.filter((a) => !a.approved_at).length,
      };
    })
    .sort((a, b) => b.actual - a.actual || a.name.localeCompare(b.name, 'ja'));

  return {
    actual: sumNinku(atts.map((a) => a.computed_ninku)),
    planned: plans.length,
    amount: atts.reduce((sum, a) => sum + ninkuAmount(a.computed_ninku, a.unit_price), 0),
    pendingCount: atts.filter((a) => !a.approved_at).length,
    bySite,
    byMember,
  };
}

/** CSV の行（表計算ソフトで開いてそのまま請求書の元にできる形） */
export function attendanceCsvRows(input: {
  range: Range;
  sites: Pick<SiteRow, 'id' | 'name' | 'client_name'>[];
  users: UserBrief[];
  attendances: AttendanceRow[];
  siteId?: string | null;
  userId?: string | null;
}): (string | number)[][] {
  const header = ['日付', '曜日', '現場', '元請', '名前', '職種', '区分', '残業(時間)', '人工', '単価(円)', '金額(円)', '承認'];
  const dow = ['日', '月', '火', '水', '木', '金', '土'];
  const rows = input.attendances
    .filter(
      (a) =>
        inPeriod(a.work_date, input.range) &&
        (!input.siteId || a.site_id === input.siteId) &&
        (!input.userId || a.user_id === input.userId),
    )
    .sort(
      (a, b) =>
        a.work_date.localeCompare(b.work_date) ||
        a.site_id.localeCompare(b.site_id) ||
        a.user_id.localeCompare(b.user_id),
    )
    .map((a) => {
      const site = input.sites.find((s) => s.id === a.site_id);
      const u = input.users.find((x) => x.id === a.user_id);
      const [y, m, d] = a.work_date.split('-').map(Number);
      return [
        a.work_date,
        dow[new Date(Date.UTC(y, m - 1, d)).getUTCDay()],
        site?.name ?? '',
        site?.client_name ?? '',
        u?.display_name ?? '',
        u?.trade ?? '',
        a.unit === 1 ? '1日' : '半日',
        a.overtime_hours,
        a.computed_ninku,
        a.unit_price,
        ninkuAmount(a.computed_ninku, a.unit_price),
        a.approved_at ? '済' : '未',
      ];
    });
  const total = input.attendances.length ? summarize({ ...input, assignments: [] }) : null;
  const footer = total ? [['合計', '', '', '', '', '', '', '', total.actual, '', total.amount, '']] : [];
  return [header, ...rows, ...footer];
}
