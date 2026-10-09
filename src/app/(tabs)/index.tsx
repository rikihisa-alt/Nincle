import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { QuickAttendance } from '@/components/attendance';
import { MonthCalendar, type DayMark } from '@/components/calendar';
import { Screen } from '@/components/screen';
import { Columns, useLayout, type LayoutMode } from '@/lib/layout';
import { ANSWER_BUTTON, ANSWER_LABEL } from '@/components/site/yotei-tab';
import {
  Bar,
  BigButton,
  Card,
  Chip,
  CountBadge,
  DueBadge,
  EmptyState,
  ErrorView,
  Icon,
  Icons,
  ListRow,
  LoadingView,
  SectionLabel,
  Segmented,
  T,
  Tanzaku,
  dueColor,
  type IconName,
  FitText,
} from '@/components/ui';
import { MinTap, siteColor, Space, useColors } from '@/constants/theme';
import type { SiteListItem } from '@/data/api';
import { useQueuedAttendances } from '@/data/offline';
import { api } from '@/data/client';
import { useAction, useAssignments, useAttendances, useMyPendingRequests, useMySites, useNotifications } from '@/data/queries';
import {
  addDays,
  dayOfMonth,
  daysBetween,
  dueState,
  formatLong,
  formatRange,
  formatShort,
  formatShortDow,
  lastDayOfMonth,
  monthKey,
  nowTimeJst,
  relativeDay,
  todayJst,
  weekday,
} from '@/lib/date';
import { formatNinku, formatYen, ninkuAmount, sumNinku } from '@/lib/ninku';
import type { AssignmentRow, AttendanceRow } from '@/lib/types';
import { useMe } from '@/providers/auth';

type View_ = 'board' | 'calendar';

/** ホーム（現場ボード）：上から「今日 → 明日（1画面に収める）→ やること → 今週 → 今月の人工」 */
export default function HomeScreen() {
  const c = useColors();
  const { userId, profile } = useMe();
  const today = todayJst();
  const [view, setView] = useState<View_>('board');
  const [calMonth, setCalMonth] = useState(monthKey(today));
  const { mode, isWide } = useLayout();

  const monthStart = `${monthKey(today)}-01`;
  const weekEnd = addDays(today, 6);
  const range = { from: monthStart < addDays(today, -7) ? monthStart : addDays(today, -7), to: weekEnd > lastDayOfMonth(monthKey(today)) ? weekEnd : lastDayOfMonth(monthKey(today)) };

  const sites = useMySites();
  const assignments = useAssignments({ ...range, userId });
  const attendances = useAttendances({ ...range, userId });
  const pending = useMyPendingRequests();
  const notifications = useNotifications();
  const queued = useQueuedAttendances();
  const adminSiteIds = (sites.data ?? []).filter((s) => s.my_role === 'admin' && s.status !== 'archived').map((s) => s.id);
  const toApprove = useAttendances({ from: addDays(today, -62), to: today, siteIds: adminSiteIds }, adminSiteIds.length > 0);

  const loading = sites.isLoading || assignments.isLoading || attendances.isLoading;
  const error = sites.error || assignments.error || attendances.error;
  const refetchAll = () =>
    Promise.all([sites.refetch(), assignments.refetch(), attendances.refetch(), pending.refetch(), notifications.refetch(), toApprove.refetch()]);

  const siteById = new Map((sites.data ?? []).map((s) => [s.id, s]));
  const siteOrder = (sites.data ?? []).map((s) => s.id);
  const unreadNotices = (notifications.data ?? []).filter((n) => !n.read_at && n.type !== 'message').length;
  const approvals = (toApprove.data ?? []).filter((a) => !a.approved_at && a.user_id !== userId);
  const overdue = (sites.data ?? []).filter((s) => s.my_role === 'admin' && s.status === 'active' && s.due_date < today);

  const header = (
    <View style={styles.header}>
      <View style={styles.flex}>
        <T tone="textSub" style={styles.appName}>
          現場ボード{profile ? `　${profile.display_name}さん` : ''}
        </T>
        <FitText style={styles.date} accessibilityRole="header" font="heading">
          {formatLong(today)}
        </FitText>
      </View>
      {!isWide && (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`お知らせ${unreadNotices ? `、未読${unreadNotices}件` : ''}`}
        onPress={() => router.push('/notifications')}
        style={[styles.bell, { borderColor: c.border, backgroundColor: c.card }]}>
        <Icon name={Icons.bell} size={26} color={c.text} />
        <T style={styles.bellText}>お知らせ</T>
        <View style={styles.bellBadge}>
          <CountBadge count={unreadNotices} />
        </View>
      </Pressable>
      )}
    </View>
  );

  return (
    <Screen onRefresh={refetchAll}>
      {header}
      {!isWide && (
        <Segmented
          options={[
            { key: 'board', label: '段取り' },
            { key: 'calendar', label: '月の予定' },
          ]}
          value={view}
          onChange={setView}
          style={styles.segment}
        />
      )}

      {error ? (
        <ErrorView message="読み込めませんでした。電波を確かめてください" onRetry={refetchAll} />
      ) : loading ? (
        <LoadingView />
      ) : view === 'board' || isWide ? (
        <Board
          layout={mode}
          calendar={
            <>
              <SectionLabel>月の予定</SectionLabel>
              <CalendarView
                month={calMonth}
                onMonthChange={setCalMonth}
                userId={userId}
                sites={siteById}
                siteOrder={siteOrder}
                pendingDates={(pending.data ?? []).flatMap((r) => [r.target_date_from])}
                compact
              />
            </>
          }
          today={today}
          sites={siteById}
          assignments={assignments.data ?? []}
          attendances={attendances.data ?? []}
          pendingRequests={pending.data ?? []}
          approvals={approvals.length}
          overdue={overdue}
          queued={queued.length}
          hasSites={(sites.data ?? []).length > 0}
        />
      ) : (
        <CalendarView
          month={calMonth}
          onMonthChange={setCalMonth}
          userId={userId}
          sites={siteById}
          siteOrder={siteOrder}
          pendingDates={(pending.data ?? []).flatMap((r) => [r.target_date_from])}
        />
      )}
    </Screen>
  );
}

type PendingLite = {
  id: string;
  site_id: string;
  site_name: string;
  target_date_from: string;
  target_date_to: string;
  meet_time: string | null;
  note: string | null;
};

function Board({
  today,
  sites,
  assignments,
  attendances,
  pendingRequests,
  approvals,
  overdue,
  queued,
  hasSites,
  layout,
  calendar,
}: {
  layout: LayoutMode;
  calendar: React.ReactNode;
  today: string;
  sites: Map<string, SiteListItem>;
  assignments: AssignmentRow[];
  attendances: AttendanceRow[];
  pendingRequests: PendingLite[];
  approvals: number;
  overdue: SiteListItem[];
  queued: number;
  hasSites: boolean;
}) {
  const c = useColors();
  const tomorrow = addDays(today, 1);
  const byDate = (d: string) => assignments.filter((a) => a.work_date === d && sites.has(a.site_id));
  const attendanceOf = (siteId: string, d: string) => attendances.find((a) => a.site_id === siteId && a.work_date === d);
  const todays = byDate(today);
  // 予定はないが出面だけ入れた現場も今日に出す
  const extraToday = attendances.filter((a) => a.work_date === today && !todays.some((x) => x.site_id === a.site_id));
  // 出面の入れ忘れ：この1週間で、予定があったのに出面がない日
  const forgotten = assignments
    .filter(
      (a) =>
        a.work_date < today &&
        a.work_date >= addDays(today, -7) &&
        sites.get(a.site_id)?.status !== 'archived' &&
        sites.has(a.site_id) &&
        !attendanceOf(a.site_id, a.work_date),
    )
    .sort((a, b) => b.work_date.localeCompare(a.work_date))
    .slice(0, 3);

  const month = monthKey(today);
  const monthAtt = attendances.filter((a) => monthKey(a.work_date) === month);
  const monthPlan = assignments.filter((a) => monthKey(a.work_date) === month);
  const actual = sumNinku(monthAtt.map((a) => a.computed_ninku));
  const amount = monthAtt.reduce((s, a) => s + ninkuAmount(a.computed_ninku, a.unit_price), 0);

  const links: { key: string; label: string; sub?: string; icon: IconName; tone: 'soon' | 'over' | 'info'; onPress?: () => void }[] = [];
  if (queued > 0) {
    links.push({ key: 'queued', label: `送信待ちの出面 ${queued}件`, sub: '電波が戻ったら自動で送ります', icon: Icons.wifiOff, tone: 'info' });
  }
  for (const s of overdue) {
    links.push({
      key: `over-${s.id}`,
      label: `納期超過：${s.name}`,
      sub: '延ばすか、完了にしてください',
      icon: Icons.warning,
      tone: 'over',
      onPress: () => router.push({ pathname: '/site/[id]', params: { id: s.id, tab: 'yotei' } }),
    });
  }
  if (approvals > 0) {
    links.push({
      key: 'approve',
      label: `承認待ちの出面 ${approvals}件`,
      sub: 'まとめて承認できます',
      icon: Icons.check,
      tone: 'soon',
      onPress: () => router.push('/ninku'),
    });
  }
  const todoCount = links.length + pendingRequests.length + forgotten.length;

  if (!hasSites) {
    return (
      <View style={styles.mtl}>
        <EmptyState
          title="まだ現場がありません"
          body="親方なら、まずチームを作って仲間を招待し、現場を作ります。仲間の場合は、親方から招待リンクをもらってください。"
          action={
            <View style={styles.gap}>
              <BigButton label="現場を作る" icon={Icons.add} onPress={() => router.push('/site/new')} />
              <BigButton label="チーム・招待" icon={Icons.people} kind="secondary" onPress={() => router.push('/team')} />
              <BigButton label="使い方を見る" icon={Icons.help} kind="ghost" onPress={() => router.push('/help')} />
            </View>
          }
        />
      </View>
    );
  }

  const todaySec = (
    <>
      <SectionLabel>{`今日の段取り（${formatShortDow(today)}）`}</SectionLabel>
      {todays.length === 0 && extraToday.length === 0 ? (
        <Card style={styles.emptyDay}>
          <T tone="textSub" style={styles.none}>
            今日の予定は入っていません
          </T>
          <BigButton
            label="予定外の現場の出面を入れる"
            kind="secondary"
            compact
            icon={Icons.edit}
            onPress={() => router.push({ pathname: '/day/[date]', params: { date: today } })}
          />
        </Card>
      ) : (
        <View style={styles.gap}>
          {todays.map((a) => (
            <TodayCard key={a.id} assignment={a} site={sites.get(a.site_id)!} today={today} attendance={attendanceOf(a.site_id, today)} />
          ))}
          {extraToday.map((a) => (
            <TodayCard key={a.id} site={sites.get(a.site_id)!} today={today} attendance={a} />
          ))}
        </View>
      )}

    </>
  );
  const tomorrowSec = (
    <>
      <SectionLabel>{`明日の段取り（${formatShortDow(tomorrow)}）`}</SectionLabel>
      <Card>
        {byDate(tomorrow).length === 0 ? (
          <T tone="textSub" style={[styles.none, styles.padRow]}>
            明日の予定はまだ入っていません
          </T>
        ) : (
          byDate(tomorrow).map((a, i) => (
            <PlanRow key={a.id} first={i === 0} assignment={a} site={sites.get(a.site_id)!} siteOrder={[...sites.keys()]} />
          ))
        )}
      </Card>

    </>
  );
  const todoSec = (
    <>
      {todoCount > 0 && (
        <>
          <SectionLabel>{`やること（${todoCount}）`}</SectionLabel>
          <View style={styles.gap}>
            {pendingRequests.map((r) => (
              <RequestTodo key={r.id} request={r} />
            ))}
            {forgotten.map((a) => (
              <ForgottenTodo key={a.id} assignment={a} site={sites.get(a.site_id)!} today={today} />
            ))}
            {links.map((t) => {
              const fg = t.tone === 'over' ? c.statusOver : t.tone === 'info' ? c.info : c.statusSoon;
              const bg = t.tone === 'over' ? c.statusOverBg : t.tone === 'info' ? c.infoBg : c.statusSoonBg;
              return (
                <Pressable
                  key={t.key}
                  accessibilityRole={t.onPress ? 'button' : 'text'}
                  accessibilityLabel={[t.label, t.sub].filter(Boolean).join('、')}
                  disabled={!t.onPress}
                  onPress={t.onPress}
                  style={({ pressed }) => [styles.todo, { backgroundColor: bg, borderColor: fg }, pressed && { opacity: 0.7 }]}>
                  <Icon name={t.icon} size={24} color={fg} />
                  <View style={styles.flex}>
                    <T style={[styles.todoText, { color: c.text }]}>{t.label}</T>
                    {t.sub ? (
                      <T tone="textSub" style={styles.todoSub}>
                        {t.sub}
                      </T>
                    ) : null}
                  </View>
                  {t.onPress && <Icon name={Icons.chevron} size={20} color={fg} />}
                </Pressable>
              );
            })}
          </View>
        </>
      )}

    </>
  );
  const weekSec = (
    <>
      <SectionLabel
        right={
          <Pressable accessibilityRole="link" onPress={() => router.push('/sites')} style={styles.link}>
            <T style={[styles.linkText, { color: c.info }]}>現場一覧 ›</T>
          </Pressable>
        }>
        今週の予定
      </SectionLabel>
      <Card>
        {[2, 3, 4, 5, 6].map((n, i) => {
          const d = addDays(today, n);
          const items = byDate(d);
          const waiting = pendingRequests.filter((r) => d >= r.target_date_from && d <= r.target_date_to);
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityLabel={`${formatLong(d)}、${items.length ? items.map((a) => sites.get(a.site_id)?.name).join('、') : waiting.length ? '返事待ち' : '空き'}`}
              onPress={() => router.push({ pathname: '/day/[date]', params: { date: d } })}
              style={({ pressed }) => [styles.weekRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }, pressed && { opacity: 0.7 }]}>
              <View style={styles.dayBox}>
                <FitText style={styles.dayNum} align="center">
                  {dayOfMonth(d)}
                </FitText>
                <T style={[styles.dayDow, { color: weekday(d) === '日' ? c.statusOver : weekday(d) === '土' ? c.info : c.textSub }]}>
                  {weekday(d)}
                </T>
              </View>
              <View style={styles.flex}>
                {items.length ? (
                  items.map((a) => (
                    <View key={a.id} style={styles.weekItem}>
                      <View style={[styles.dot, { backgroundColor: siteColor(a.site_id, [...sites.keys()]) }]} />
                      <T style={styles.weekSite}>{sites.get(a.site_id)?.name}</T>
                      <T tone="textSub" style={styles.weekMeta}>
                        {a.meet_time ?? ''}
                      </T>
                    </View>
                  ))
                ) : waiting.length ? (
                  <Chip label={`返事待ち：${waiting[0].site_name}`} icon={Icons.question} fg={c.statusSoon} bg={c.statusSoonBg} />
                ) : (
                  <T tone="textSub" style={styles.weekFree}>
                    空き
                  </T>
                )}
              </View>
              <Icon name={Icons.chevron} size={20} color={c.textSub} />
            </Pressable>
          );
        })}
      </Card>

    </>
  );
  const ninkuSec = (
    <>
      <SectionLabel
        right={
          <T tone="textSub" style={styles.asOf}>
            {formatShort(today)} {nowTimeJst()} 時点
          </T>
        }>
        {`${Number(month.slice(5, 7))}月の人工（自分）`}
      </SectionLabel>
      <Tanzaku stripe={c.accent} onPress={() => router.push('/ninku')} accessibilityLabel={`今月の人工、実績${formatNinku(actual)}、予定${monthPlan.length}。集計を開く`}>
        <View style={styles.ninkuHead}>
          <View style={styles.flex}>
            <FitText style={styles.ninkuBig}>{formatNinku(actual)}</FitText>
            <T tone="textSub" style={styles.ninkuUnit}>
              実績 人工
            </T>
          </View>
          <View style={styles.flex}>
            <FitText tone="textSub" style={styles.ninkuPlan}>
              {formatNinku(monthPlan.length)}
            </FitText>
            <T tone="textSub" style={styles.ninkuUnit}>
              予定 人工
            </T>
          </View>
        </View>
        <Bar value={actual} max={Math.max(monthPlan.length, actual)} />
        <View style={styles.rowBetween}>
          <T tone="textSub" style={styles.meta}>
            今月の稼ぎ（税抜）
          </T>
          <FitText style={styles.amount} align="right" boxStyle={styles.flex}>{`${formatYen(amount)}円`}</FitText>
        </View>
      </Tanzaku>
    </>
  );

  // スマホ：縦1列／iPad：2列／パソコン：3列（カレンダーも常に出す）
  if (layout === 'desktop') {
    return (
      <Columns flex={[1.1, 1, 1]}>
        {[
          <View key="a">
            {todaySec}
            {tomorrowSec}
          </View>,
          <View key="b">
            {todoSec}
            {weekSec}
          </View>,
          <View key="c">
            {calendar}
            {ninkuSec}
          </View>,
        ]}
      </Columns>
    );
  }
  if (layout === 'tablet') {
    return (
      <Columns flex={[1, 1]}>
        {[
          <View key="a">
            {todaySec}
            {tomorrowSec}
            {weekSec}
          </View>,
          <View key="b">
            {todoSec}
            {ninkuSec}
            {calendar}
          </View>,
        ]}
      </Columns>
    );
  }
  return (
    <>
      {todaySec}
      {tomorrowSec}
      {todoSec}
      {weekSec}
      {ninkuSec}
    </>
  );
}

/** 「入れる？」にホームのまま返事する */
function RequestTodo({ request }: { request: PendingLite }) {
  const c = useColors();
  const { userId } = useMe();
  const { run, busy } = useAction();
  return (
    <View style={[styles.todoBox, { backgroundColor: c.statusSoonBg, borderColor: c.statusSoon }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${request.site_name}の確認を開く`}
        onPress={() => router.push({ pathname: '/site/[id]', params: { id: request.site_id, tab: 'yotei' } })}
        style={styles.todoHead}>
        <Icon name={Icons.question} size={24} color={c.statusSoon} />
        <View style={styles.flex}>
          <T style={[styles.todoText, { color: c.text }]}>入れる？　{request.site_name}</T>
          <T tone="textSub" style={styles.todoSub}>
            {formatRange(request.target_date_from, request.target_date_to)}
            {request.meet_time ? `　${request.meet_time}集合` : ''}
          </T>
          {request.note ? (
            <T tone="textSub" style={styles.todoNote} numberOfLines={2}>
              {request.note}
            </T>
          ) : null}
        </View>
        <Icon name={Icons.chevron} size={20} color={c.statusSoon} />
      </Pressable>
      <View style={styles.answerRow}>
        {(['yes', 'no', 'unknown'] as const).map((a) => (
          <BigButton
            key={a}
            label={ANSWER_BUTTON[a]}
            kind={a === 'yes' ? 'primary' : 'secondary'}
            compact
            disabled={busy}
            onPress={() => run(() => api.reply(request.id, userId, a), `「${ANSWER_LABEL[a]}」と返事しました`)}
            style={styles.flex}
          />
        ))}
      </View>
    </View>
  );
}

/** 出面の入れ忘れ。ホームのまま入れられる */
function ForgottenTodo({ assignment, site, today }: { assignment: AssignmentRow; site: SiteListItem; today: string }) {
  const c = useColors();
  return (
    <View style={[styles.todoBox, { backgroundColor: c.statusSoonBg, borderColor: c.statusSoon }]}>
      <View style={styles.todoHead}>
        <Icon name={Icons.edit} size={24} color={c.statusSoon} />
        <View style={styles.flex}>
          <T style={[styles.todoText, { color: c.text }]}>出面の入れ忘れ　{relativeDay(assignment.work_date, today)}</T>
          <T tone="textSub" style={styles.todoSub}>
            {site.name}
          </T>
        </View>
      </View>
      <QuickAttendance siteId={site.id} rule={site.overtime_rule} date={assignment.work_date} hideLabel />
    </View>
  );
}

/** 今日の現場カード：名前・集合・住所と、押すだけの出面 */
function TodayCard({
  assignment,
  site,
  today,
  attendance,
}: {
  assignment?: AssignmentRow;
  site: SiteListItem;
  today: string;
  attendance?: AttendanceRow;
}) {
  const c = useColors();
  const state = dueState(today, site.due_date);
  const open = () => router.push({ pathname: '/site/[id]', params: { id: site.id } });
  return (
    <Tanzaku stripe={site.status === 'active' ? dueColor(c, state).fg : c.border}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${site.name}を開く`} onPress={open} style={styles.cardHead}>
        <T style={[styles.siteName, styles.flex]}>{site.name}</T>
        <Icon name={Icons.chevron} size={22} color={c.textSub} />
      </Pressable>
      <View style={styles.chips}>
        {site.status === 'active' && state !== 'active' && <DueBadge state={state} daysLeft={daysBetween(today, site.due_date)} />}
        {site.unread > 0 && <Chip label={`やりとり 新着${site.unread}`} icon={Icons.bell} fg={c.info} bg={c.infoBg} />}
      </View>
      {(assignment?.meet_time || assignment?.note) && (
        <View style={styles.row}>
          <Icon name={Icons.clock} size={20} color={c.text} />
          <T style={styles.planText}>
            {[assignment.meet_time ? `${assignment.meet_time} 集合` : null, assignment.note].filter(Boolean).join('　')}
          </T>
        </View>
      )}
      {site.address && (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`住所 ${site.address}。地図を開く`}
          onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address!)}`)}
          style={styles.row}>
          <Icon name={Icons.pin} size={20} color={c.textSub} />
          <T tone="textSub" style={styles.meta}>
            {site.address}
          </T>
          <T style={[styles.mapLink, { color: c.info }]}>地図</T>
        </Pressable>
      )}
      <QuickAttendance siteId={site.id} rule={site.overtime_rule} date={today} existing={attendance} locked={site.status === 'archived'} />
    </Tanzaku>
  );
}

/** 明日の段取り：1行ずつ（今日と同じ画面に収まるように） */
function PlanRow({ assignment, site, siteOrder, first }: { assignment: AssignmentRow; site: SiteListItem; siteOrder: string[]; first: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/site/[id]', params: { id: site.id } })}
      style={({ pressed }) => [styles.planRow, !first && { borderTopWidth: 1, borderTopColor: c.border }, pressed && { opacity: 0.7 }]}>
      <View style={[styles.planDot, { backgroundColor: siteColor(site.id, siteOrder) }]} />
      <View style={styles.flex}>
        <T style={styles.weekSite}>{site.name}</T>
        {(assignment.meet_time || assignment.note) && (
          <T tone="textSub" style={styles.meta}>
            {[assignment.meet_time ? `${assignment.meet_time} 集合` : null, assignment.note].filter(Boolean).join('　')}
          </T>
        )}
      </View>
      <Icon name={Icons.chevron} size={20} color={c.textSub} />
    </Pressable>
  );
}

function CalendarView({
  month,
  onMonthChange,
  userId,
  sites,
  siteOrder,
  pendingDates,
  compact,
}: {
  compact?: boolean;
  month: string;
  onMonthChange: (m: string) => void;
  userId: string;
  sites: Map<string, SiteListItem>;
  siteOrder: string[];
  pendingDates: string[];
}) {
  const c = useColors();
  const from = `${month}-01`;
  const to = lastDayOfMonth(month);
  const assignments = useAssignments({ from, to, userId });
  const attendances = useAttendances({ from, to, userId });
  const marks: Record<string, DayMark[]> = {};
  for (const a of assignments.data ?? []) {
    (marks[a.work_date] ??= []).push({ color: siteColor(a.site_id, siteOrder), label: sites.get(a.site_id)?.name ?? '現場' });
  }
  for (const d of pendingDates) {
    if (d >= from && d <= to) (marks[d] ??= []).push({ color: c.border, label: '返事待ちの確認' });
  }
  const shownSites = [...new Set((assignments.data ?? []).map((a) => a.site_id))];
  const workedDays = new Set((attendances.data ?? []).map((a) => a.work_date)).size;

  return (
    <View style={compact ? undefined : styles.mtl}>
      <Card style={styles.calCard}>
        <MonthCalendar
          month={month}
          onMonthChange={onMonthChange}
          marks={marks}
          onSelect={(d) => router.push({ pathname: '/day/[date]', params: { date: d } })}
        />
      </Card>
      <T tone="textSub" style={styles.calHelp}>
        日付を押すと、その日の現場と出面が開きます
      </T>
      <SectionLabel>{`この月の現場（${shownSites.length}か所・出面${workedDays}日）`}</SectionLabel>
      {shownSites.length === 0 ? (
        <T tone="textSub" style={styles.none}>
          この月の予定はありません
        </T>
      ) : (
        <Card>
          {shownSites.map((id, i) => {
            const s = sites.get(id);
            const days = (assignments.data ?? []).filter((a) => a.site_id === id).length;
            return (
              <ListRow
                key={id}
                first={i === 0}
                title={s?.name ?? '現場'}
                sub={`予定 ${days}日`}
                left={<View style={[styles.legend, { backgroundColor: siteColor(id, siteOrder) }]} />}
                onPress={() => router.push({ pathname: '/site/[id]', params: { id } })}
              />
            );
          })}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: Space.s },
  mtl: { marginTop: Space.l },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.s },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Space.s },
  header: { paddingTop: Space.l, flexDirection: 'row', alignItems: 'center', gap: Space.s },
  appName: { fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  date: { fontSize: 30, fontWeight: '900', marginTop: 2 },
  bell: { minWidth: MinTap + 16, minHeight: MinTap + 8, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Space.s },
  bellText: { fontSize: 12, fontWeight: '800', marginTop: 2 },
  bellBadge: { position: 'absolute', top: -8, right: -8 },
  segment: { marginTop: Space.l },
  todo: { flexDirection: 'row', alignItems: 'center', gap: Space.s, borderWidth: 1, borderRadius: 10, padding: Space.m, minHeight: MinTap },
  todoBox: { borderWidth: 1, borderRadius: 10, padding: Space.m, gap: Space.s },
  todoHead: { flexDirection: 'row', alignItems: 'center', gap: Space.s },
  todoNote: { fontSize: 14, fontWeight: '600', lineHeight: 20, marginTop: 2 },
  answerRow: { flexDirection: 'row', gap: Space.s },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.s },
  mapLink: { fontSize: 15, fontWeight: '800', textDecorationLine: 'underline' },
  emptyDay: { padding: Space.l, gap: Space.m },
  padRow: { paddingHorizontal: Space.l, paddingVertical: Space.m },
  planRow: { minHeight: MinTap + 4, flexDirection: 'row', alignItems: 'center', gap: Space.m, paddingHorizontal: Space.l, paddingVertical: Space.s },
  planDot: { width: 14, height: 14, borderRadius: 7 },
  ninkuHead: { flexDirection: 'row', gap: Space.l },
  ninkuPlan: { fontSize: 32, fontWeight: '900', fontVariant: ['tabular-nums'] },
  todoText: { fontSize: 17, fontWeight: '900', lineHeight: 24 },
  todoSub: { fontSize: 15, fontWeight: '700', lineHeight: 21, marginTop: 2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Space.s },
  siteName: { fontSize: 21, fontWeight: '900' },
  planText: { fontSize: 18, fontWeight: '700', flexShrink: 1 },
  meta: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  none: { fontSize: 16, fontWeight: '700', paddingVertical: Space.s },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Space.xs },
  linkText: { fontSize: 16, fontWeight: '800', textDecorationLine: 'underline' },
  weekRow: { minHeight: MinTap + 8, flexDirection: 'row', alignItems: 'center', gap: Space.m, paddingHorizontal: Space.l, paddingVertical: Space.s },
  dayBox: { width: 40, alignItems: 'center' },
  dayNum: { fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  dayDow: { fontSize: 14, fontWeight: '800' },
  weekItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  weekSite: { fontSize: 17, fontWeight: '800' },
  weekMeta: { fontSize: 15, fontWeight: '600' },
  weekFree: { fontSize: 16, fontWeight: '700' },
  asOf: { fontSize: 14, fontWeight: '700' },
  ninkuBig: { fontSize: 40, fontWeight: '900', fontVariant: ['tabular-nums'] },
  ninkuUnit: { fontSize: 16, fontWeight: '700' },
  amount: { fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  calCard: { padding: Space.s },
  calHelp: { fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: Space.s },
  legend: { width: 16, height: 16, borderRadius: 8 },
});
