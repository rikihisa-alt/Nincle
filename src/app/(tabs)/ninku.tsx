import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/form';
import { Screen } from '@/components/screen';
import {
  Bar,
  BigButton,
  Card,
  Chip,
  EmptyState,
  ErrorView,
  Hint,
  Icon,
  Icons,
  ListRow,
  LoadingView,
  SectionLabel,
  Segmented,
  T,
  Tanzaku,
  FitText,
} from '@/components/ui';
import { MinTap, Space, useColors } from '@/constants/theme';
import { api } from '@/data/client';
import { useAction, useAssignments, useAttendances, useClosings, useMySites, useMyTeams, useTeam } from '@/data/queries';
import { attendanceCsvRows, summarize, type MemberTotal, type SiteTotal } from '@/lib/aggregate';
import { confirm } from '@/lib/confirm';
import { exportCsv, toCsv } from '@/lib/csv';
import { formatShort, formatShortDow, formatStamp, nowTimeJst, todayJst } from '@/lib/date';
import { describeAttendance, formatNinku, formatYen } from '@/lib/ninku';
import { Columns, useLayout } from '@/lib/layout';
import { closingDayLabel, periodContaining, periodOf, shiftPeriod } from '@/lib/period';
import type { UserBrief } from '@/lib/types';
import { useMe } from '@/providers/auth';
import { useToast } from '@/providers/toast';

type By = 'site' | 'member';

/** 人工集計：締めの期間ごとに、現場別・人別の人工と金額。確定（締め）とCSV書き出し */
export default function NinkuScreen() {
  const c = useColors();
  const { userId } = useMe();
  const toast = useToast();
  const teams = useMyTeams();
  const [teamId, setTeamId] = useState<string | null>(null);
  const currentTeamId = teamId ?? teams.data?.[0]?.id ?? null;
  const team = useTeam(currentTeamId);
  const closingDay = team.data?.team.closing_day ?? null;
  const [periodKey, setPeriodKey] = useState<string | null>(null);
  const period = periodKey ? periodOf(periodKey, closingDay) : periodContaining(todayJst(), closingDay);
  const [by, setBy] = useState<By>('site');
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  const [openMember, setOpenMember] = useState<string | null>(null);
  const { run, busy } = useAction();
  const { mode } = useLayout();

  const sites = useMySites();
  const teamSites = (sites.data ?? []).filter((s) => s.team_id === currentTeamId);
  const siteIds = teamSites.map((s) => s.id);
  const range = { from: period.start, to: period.end };
  const attendances = useAttendances({ ...range, siteIds }, siteIds.length > 0);
  const assignments = useAssignments({ ...range, siteIds }, siteIds.length > 0);
  const closings = useClosings(currentTeamId);

  const isOwner = team.data?.team.owner_user_id === userId;
  const adminSiteIds = teamSites.filter((s) => s.my_role === 'admin').map((s) => s.id);
  const isAdmin = adminSiteIds.length > 0;
  const closing = (closings.data ?? []).find((cl) => cl.period_start === period.start && cl.period_end === period.end);
  const users: UserBrief[] = (team.data?.members ?? []).map((m) => m.user).filter((u): u is UserBrief => Boolean(u));
  // 管理していない現場の予定人工は、自分の分だけ数える（他人の出面は見えないので、比べられるように）
  const visiblePlans = (assignments.data ?? []).filter((a) => adminSiteIds.includes(a.site_id) || a.user_id === userId);

  const summary = summarize({
    range: period,
    sites: teamSites,
    users,
    attendances: attendances.data ?? [],
    assignments: visiblePlans,
    siteId: siteFilter,
  });
  const pending = (attendances.data ?? []).filter((a) => !a.approved_at && adminSiteIds.includes(a.site_id));
  const siteName = (id: string) => teamSites.find((s) => s.id === id)?.name ?? '';
  const nameOf = (id: string) => users.find((u) => u.id === id)?.display_name ?? '退会した人';

  const loading = teams.isLoading || sites.isLoading || team.isLoading || attendances.isLoading;
  const error = teams.error || sites.error || attendances.error;
  const refetchAll = () => Promise.all([teams.refetch(), sites.refetch(), attendances.refetch(), assignments.refetch(), closings.refetch()]);

  const onExport = async () => {
    const rows = attendanceCsvRows({
      range: period,
      sites: teamSites,
      users,
      attendances: attendances.data ?? [],
      siteId: siteFilter,
    });
    if (rows.length <= 1) {
      toast('この期間の出面はありません', 'info');
      return;
    }
    try {
      const suffix = siteFilter ? `_${siteName(siteFilter)}` : '';
      await exportCsv(`人工_${period.key}${suffix}.csv`, toCsv(rows));
      toast('CSVを書き出しました', 'ok');
    } catch {
      toast('書き出せませんでした', 'error');
    }
  };

  const onClose = async () => {
    if (!currentTeamId) return;
    const warn = pending.length ? `承認待ちが${pending.length}件ありますが、そのまま確定します。` : '';
    if (
      !(await confirm(
        `${period.label}を確定する`,
        `${formatShort(period.start)}〜${formatShort(period.end)}の出面と単価を固めます。確定すると誰も直せなくなります（親方は戻せます）。${warn}`,
        '確定する',
      ))
    ) {
      return;
    }
    await run(() => api.closePeriod(currentTeamId, period.start, period.end), `${period.label}を確定しました`);
  };

  const onReopen = async () => {
    if (!closing) return;
    if (!(await confirm('確定を戻す', `${period.label}を直せる状態に戻します。`, '戻す'))) return;
    await run(() => api.reopenPeriod(closing.id), '確定を戻しました');
  };

  if (!loading && !error && !(teams.data ?? []).length) {
    return (
      <Screen>
        <Title />
        <EmptyState
          title="まだチームがありません"
          body="チームの現場で入れた出面が、ここで月ごとに集計されます。"
          action={<BigButton label="チーム・招待" icon={Icons.people} onPress={() => router.push('/team')} />}
        />
      </Screen>
    );
  }


  const filterSec = (
    <>
          {siteFilter && (
            <View style={[styles.filterBar, { backgroundColor: c.infoBg, borderColor: c.info }]}>
              <T style={[styles.filterText, { color: c.text }]}>{siteName(siteFilter)} だけ表示中</T>
              <BigButton label="全部に戻す" kind="secondary" compact onPress={() => setSiteFilter(null)} />
            </View>
          )}
    </>
  );
  const totalsSec = (
    <>
          <SectionLabel>{isAdmin ? '合計' : '自分の合計'}</SectionLabel>
          <Tanzaku stripe={c.accent}>
            <View style={styles.totals}>
              <View style={styles.flex}>
                <FitText style={styles.big}>{formatNinku(summary.actual)}</FitText>
                <T tone="textSub" style={styles.unit}>
                  実績 人工
                </T>
              </View>
              <View style={[styles.divider, { backgroundColor: c.border }]} />
              <View style={styles.flex}>
                <FitText tone="textSub" style={styles.big}>
                  {formatNinku(summary.planned)}
                </FitText>
                <T tone="textSub" style={styles.unit}>
                  予定 人工
                </T>
              </View>
            </View>
            <Bar value={summary.actual} max={Math.max(summary.planned, summary.actual)} />
            <View style={styles.amountRow}>
              <FitText style={styles.amount}>{`${formatYen(summary.amount)}円`}</FitText>
              <T tone="textSub" style={styles.unit}>
                税抜{isAdmin ? '' : '・あなたの稼ぎ'}
              </T>
            </View>
            {summary.pendingCount > 0 && (
              <T style={[styles.pendingNote, { color: c.statusSoon }]}>承認待ちの {summary.pendingCount} 件も含んでいます</T>
            )}
          </Tanzaku>
    </>
  );
  const pendingSec = (
    <>
          {isAdmin && pending.length > 0 && !closing && (
            <>
              <SectionLabel>{`確認待ち（${pending.length}件）`}</SectionLabel>
              <Card>
                {pending.slice(0, 20).map((a, i) => (
                  <ListRow
                    key={a.id}
                    first={i === 0}
                    title={`${formatShortDow(a.work_date)}　${nameOf(a.user_id)}`}
                    sub={`${siteName(a.site_id)}・${describeAttendance(a.unit, a.overtime_hours)}（${formatNinku(a.computed_ninku)}人工）`}
                    right={<BigButton label="承認" compact disabled={busy} onPress={() => run(() => api.approveAttendances([a.id]), '承認しました')} />}
                  />
                ))}
              </Card>
              {pending.length > 1 && (
                <BigButton
                  label={`${pending.length}件まとめて承認`}
                  icon={Icons.check}
                  busy={busy}
                  onPress={() => run(() => api.approveAttendances(pending.map((a) => a.id)), `${pending.length}件承認しました`)}
                  style={styles.mt}
                />
              )}
            </>
          )}
    </>
  );
  const segSec = (
    <>
          {isAdmin && (
            <Segmented
              options={[
                { key: 'site', label: '現場別' },
                { key: 'member', label: '人別' },
              ]}
              value={by}
              onChange={setBy}
              style={styles.mtl}
            />
          )}
    </>
  );
  const siteSec = (
    <>
              <SectionLabel>現場別</SectionLabel>
              {summary.bySite.length === 0 ? (
                <T tone="textSub" style={styles.none}>
                  この期間の出面・予定はありません
                </T>
              ) : (
                <View style={styles.gap}>
                  {summary.bySite.map((s) => {
                    const max = Math.max(...summary.bySite.map((x) => Math.max(x.actual, x.planned)));
                    return (
                      <Tanzaku
                        key={s.siteId}
                        onPress={() => setSiteFilter(siteFilter === s.siteId ? null : s.siteId)}
                        accessibilityLabel={`${s.siteName}、${formatNinku(s.actual)}人工。押すとこの現場だけ表示`}>
                        <View style={styles.siteRow}>
                          <View style={styles.flex}>
                            <T style={styles.siteName}>{s.siteName}</T>
                            <T tone="textSub" style={styles.meta}>
                              単価 {s.priceMin === s.priceMax ? formatYen(s.priceMin) : `${formatYen(s.priceMin)}\u2060〜\u2060${formatYen(s.priceMax)}`}円
                              {s.memberIds.length ? ` ／ ${s.memberIds.map(nameOf).join('・')}` : ''}
                            </T>
                          </View>
                          <View style={styles.right}>
                            <FitText style={styles.mid} align="right">
                              {formatNinku(s.actual)}
                            </FitText>
                            <T tone="textSub" style={styles.small}>
                              予定 {formatNinku(s.planned)}
                            </T>
                          </View>
                        </View>
                        <Bar value={s.actual} max={max} color={c.statusActive} />
                        <FitText style={styles.siteAmount} align="right">{`${formatYen(s.amount)}円`}</FitText>
                      </Tanzaku>
                    );
                  })}
                </View>
              )}
            
    </>
  );
  const memberSec = (
    <>
              <SectionLabel>人別（支払いの目安）</SectionLabel>
              {summary.byMember.length === 0 ? (
                <T tone="textSub" style={styles.none}>
                  この期間の出面はありません
                </T>
              ) : (
                <Card>
                  {summary.byMember.map((m, i) => {
                    const open = openMember === m.userId;
                    const rows = (attendances.data ?? [])
                      .filter((a) => a.user_id === m.userId && (!siteFilter || a.site_id === siteFilter))
                      .sort((a, b) => a.work_date.localeCompare(b.work_date));
                    return (
                      <View key={m.userId} style={i > 0 && { borderTopWidth: 1, borderTopColor: c.border }}>
                        <ListRow
                          first
                          title={`${m.name}${m.trade ? `（${m.trade}）` : ''}`}
                          sub={`${m.days}日・${formatNinku(m.actual)}人工${m.pending ? `・承認待ち${m.pending}` : ''}`}
                          right={<FitText style={styles.memberAmount} align="right" boxStyle={styles.memberAmountBox}>{`${formatYen(m.amount)}円`}</FitText>}
                          onPress={() => setOpenMember(open ? null : m.userId)}
                          accessibilityLabel={`${m.name}、${formatNinku(m.actual)}人工、${formatYen(m.amount)}円。押すと日ごとの内訳`}
                        />
                        {open && (
                          <View style={[styles.detail, { backgroundColor: c.cardAlt }]}>
                            {rows.map((a) => (
                              <View key={a.id} style={styles.detailRow}>
                                <T style={styles.detailDate}>{formatShortDow(a.work_date)}</T>
                                <View style={styles.flex}>
                                  <T style={styles.detailText}>{siteName(a.site_id)}</T>
                                  <T tone="textSub" style={styles.small}>
                                    {describeAttendance(a.unit, a.overtime_hours)}・{a.approved_at ? '承認済み' : '承認待ち'}
                                  </T>
                                </View>
                                <FitText style={styles.detailNinku} align="right" boxStyle={styles.detailNinkuBox}>
                                  {formatNinku(a.computed_ninku)}
                                </FitText>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </Card>
              )}
            
    </>
  );
  const exportSec = (
    <>
          <SectionLabel>書き出し・確定</SectionLabel>
          <View style={styles.gap}>
            <BigButton
              label={siteFilter ? 'この現場の出面をCSVで書き出す' : 'CSVで書き出す'}
              icon={Icons.download}
              kind="secondary"
              onPress={onExport}
              accessibilityHint="表計算ソフトで開けるファイルを作ります。請求書づくりに使えます"
            />
            {isOwner &&
              (closing ? (
                <BigButton label="確定を戻す" icon={Icons.unlock} kind="ghost" busy={busy} onPress={onReopen} />
              ) : (
                <BigButton label={`${period.label}を確定する`} icon={Icons.lock} busy={busy} onPress={onClose} />
              ))}
          </View>
          {isOwner ? (
            <Hint>{`月末（締め日）に中身を確かめて「確定」してください。確定した月は誰も直せなくなり、単価も固まります。締め日は「チーム」の設定で変えられます（いまは${closingDayLabel(closingDay)}）。`}</Hint>
          ) : (
            <Hint>確定（締め）は親方が行います。自分の出面が違っていたら、確定の前に直してください。</Hint>
          )}
    </>
  );
  const tables = (
    <>
      <SectionLabel>現場別（押すとその現場だけ表示）</SectionLabel>
      <SiteTable rows={summary.bySite} nameOf={nameOf} selected={siteFilter} onSelect={(id: string) => setSiteFilter(siteFilter === id ? null : id)} />
      <SectionLabel>人別（支払いの目安）</SectionLabel>
      <MemberTable rows={summary.byMember} />
    </>
  );

  let content;
  if (mode === 'phone') {
    content = (
      <>
        {filterSec}
        {totalsSec}
        {pendingSec}
        {segSec}
        {by === 'site' || !isAdmin ? siteSec : memberSec}
        {exportSec}
      </>
    );
  } else {
    // iPad：左に合計・確認待ち・書き出し、右に内訳／パソコン：右の内訳を表で
    content = (
      <>
        {filterSec}
        <Columns flex={mode === 'desktop' ? [2, 3] : [1, 1]}>
          {[
            <View key="l">
              {totalsSec}
              {pendingSec}
              {exportSec}
            </View>,
            <View key="r">
              {mode === 'desktop' && isAdmin ? (
                tables
              ) : (
                <>
                  {segSec}
                  {by === 'site' || !isAdmin ? siteSec : memberSec}
                </>
              )}
            </View>,
          ]}
        </Columns>
      </>
    );
  }

  return (
    <Screen onRefresh={refetchAll}>
      <Title />

      {(teams.data ?? []).length > 1 && (
        <ChoiceChips
          options={(teams.data ?? []).map((t) => t.id)}
          labels={Object.fromEntries((teams.data ?? []).map((t) => [t.id, t.name]))}
          value={currentTeamId}
          onChange={(id) => {
            setTeamId(id);
            setSiteFilter(null);
            setPeriodKey(null);
          }}
        />
      )}

      <View style={styles.periodBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="前の月"
          onPress={() => setPeriodKey(shiftPeriod(period, -1, closingDay).key)}
          style={[styles.navBtn, { borderColor: c.border, backgroundColor: c.cardAlt }]}>
          <Icon name={Icons.chevronLeft} size={26} color={c.text} />
        </Pressable>
        <View style={styles.periodCenter} accessible accessibilityLabel={`${period.label}、${formatShort(period.start)}から${formatShort(period.end)}`}>
          <FitText style={styles.periodLabel} align="center" font="heading">
            {period.label}
          </FitText>
          <FitText tone="textSub" style={styles.periodRange} align="center">
            {`${formatShort(period.start)}〜${formatShort(period.end)}（${closingDayLabel(closingDay)}）`}
          </FitText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="次の月"
          onPress={() => setPeriodKey(shiftPeriod(period, 1, closingDay).key)}
          style={[styles.navBtn, { borderColor: c.border, backgroundColor: c.cardAlt }]}>
          <Icon name={Icons.chevron} size={26} color={c.text} />
        </Pressable>
      </View>

      <View style={styles.statusRow}>
        {closing ? (
          <Chip label={`確定済み（${formatStamp(closing.closed_at)}）`} icon={Icons.lock} fg={c.ok} bg={c.okBg} />
        ) : (
          <Chip label="未確定" icon={Icons.unlock} fg={c.statusSoon} bg={c.statusSoonBg} />
        )}
        <T tone="textSub" style={styles.asOf}>
          {formatShort(todayJst())} {nowTimeJst()} 時点
        </T>
      </View>

      {error ? (
        <ErrorView message="読み込めませんでした" onRetry={refetchAll} />
      ) : loading ? (
        <LoadingView />
      ) : (
        content
      )}
    </Screen>
  );
}

function Title() {
  return (
    <View style={styles.header}>
      <T style={styles.title} accessibilityRole="header">
        人工集計
      </T>
    </View>
  );
}

/** パソコン用：現場別の表 */
function SiteTable({
  rows,
  nameOf,
  selected,
  onSelect,
}: {
  rows: SiteTotal[];
  nameOf: (id: string) => string;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const c = useColors();
  if (rows.length === 0) {
    return (
      <T tone="textSub" style={styles.none}>
        この期間の出面・予定はありません
      </T>
    );
  }
  return (
    <Card>
      <View style={[styles.tr, styles.th, { backgroundColor: c.cardAlt }]}>
        <T style={[styles.thText, styles.cName]}>現場</T>
        <T style={[styles.thText, styles.cPrice]}>単価</T>
        <T style={[styles.thText, styles.cNum]}>予定</T>
        <T style={[styles.thText, styles.cNum]}>実績</T>
        <T style={[styles.thText, styles.cYen]}>金額</T>
      </View>
      {rows.map((s) => (
        <Pressable
          key={s.siteId}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === s.siteId }}
          onPress={() => onSelect(s.siteId)}
          style={(state) => [
            styles.tr,
            { borderTopColor: c.border },
            selected === s.siteId && { backgroundColor: c.infoBg },
            (state as { hovered?: boolean }).hovered && selected !== s.siteId && { backgroundColor: c.cardAlt },
          ]}>
          <View style={styles.cName}>
            <T style={styles.tdStrong}>{s.siteName}</T>
            <T tone="textSub" style={styles.tdSub} numberOfLines={1}>
              {s.memberIds.map(nameOf).join('・')}
            </T>
          </View>
          <T style={[styles.td, styles.cPrice]}>
            {s.priceMin === s.priceMax ? formatYen(s.priceMin) : `${formatYen(s.priceMin)}\u2060〜\u2060${formatYen(s.priceMax)}`}
          </T>
          <T tone="textSub" style={[styles.tdNum, styles.cNum]}>
            {formatNinku(s.planned)}
          </T>
          <T style={[styles.tdNum, styles.tdStrong, styles.cNum]}>{formatNinku(s.actual)}</T>
          <T style={[styles.tdNum, styles.tdStrong, styles.cYen]}>{`${formatYen(s.amount)}円`}</T>
        </Pressable>
      ))}
    </Card>
  );
}

/** パソコン用：人別の表 */
function MemberTable({ rows }: { rows: MemberTotal[] }) {
  const c = useColors();
  if (rows.length === 0) {
    return (
      <T tone="textSub" style={styles.none}>
        この期間の出面はありません
      </T>
    );
  }
  return (
    <Card>
      <View style={[styles.tr, styles.th, { backgroundColor: c.cardAlt }]}>
        <T style={[styles.thText, styles.cName]}>名前</T>
        <T style={[styles.thText, styles.cNum]}>日数</T>
        <T style={[styles.thText, styles.cNum]}>実績</T>
        <T style={[styles.thText, styles.cNum]}>承認待ち</T>
        <T style={[styles.thText, styles.cYen]}>金額</T>
      </View>
      {rows.map((m) => (
        <View key={m.userId} style={[styles.tr, { borderTopColor: c.border }]}>
          <View style={styles.cName}>
            <T style={styles.tdStrong}>{m.name}</T>
            <T tone="textSub" style={styles.tdSub}>
              {m.trade ?? ''}
            </T>
          </View>
          <T style={[styles.tdNum, styles.cNum]}>{`${m.days}日`}</T>
          <T style={[styles.tdNum, styles.tdStrong, styles.cNum]}>{formatNinku(m.actual)}</T>
          <T style={[styles.tdNum, styles.cNum, m.pending ? { color: c.statusSoon } : null]}>{m.pending ? `${m.pending}件` : '—'}</T>
          <T style={[styles.tdNum, styles.tdStrong, styles.cYen]}>{`${formatYen(m.amount)}円`}</T>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  tr: { flexDirection: 'row', alignItems: 'center', gap: Space.m, paddingHorizontal: Space.l, paddingVertical: Space.m, borderTopWidth: 1, minHeight: 56 },
  th: { borderTopWidth: 0, minHeight: 44, paddingVertical: Space.s },
  thText: { fontSize: 14, fontWeight: '800' },
  td: { fontSize: 15, fontWeight: '700' },
  tdNum: { fontSize: 16, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] },
  tdStrong: { fontWeight: '900' },
  tdSub: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  cName: { flex: 3, minWidth: 0 },
  cPrice: { flex: 2, textAlign: 'right' },
  cNum: { flex: 1, textAlign: 'right' },
  cYen: { flex: 2, textAlign: 'right' },
  flex: { flex: 1 },
  gap: { gap: Space.s },
  mt: { marginTop: Space.s },
  mtl: { marginTop: Space.l },
  header: { paddingTop: Space.l, marginBottom: Space.s },
  title: { fontSize: 30, fontWeight: '900' },
  periodBar: { flexDirection: 'row', alignItems: 'center', gap: Space.s, marginTop: Space.m },
  navBtn: { width: MinTap, height: MinTap, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  periodCenter: { flex: 1, alignItems: 'center' },
  periodLabel: { fontSize: 24, fontWeight: '900' },
  periodRange: { fontSize: 14, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: Space.s, marginTop: Space.m },
  asOf: { fontSize: 14, fontWeight: '700' },
  filterBar: { flexDirection: 'row', alignItems: 'center', gap: Space.s, borderWidth: 1, borderRadius: 8, padding: Space.s, marginTop: Space.l },
  filterText: { flex: 1, fontSize: 16, fontWeight: '800' },
  totals: { flexDirection: 'row', alignItems: 'center' },
  divider: { width: 1, alignSelf: 'stretch', marginHorizontal: Space.l },
  big: { fontSize: 40, fontWeight: '900', fontVariant: ['tabular-nums'], lineHeight: 48 },
  unit: { fontSize: 15, fontWeight: '700' },
  amountRow: { marginTop: Space.xs },
  amount: { fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] },
  pendingNote: { fontSize: 14, fontWeight: '800' },
  none: { fontSize: 16, fontWeight: '700' },
  siteRow: { flexDirection: 'row', alignItems: 'center', gap: Space.m },
  siteName: { fontSize: 18, fontWeight: '800' },
  meta: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  right: { width: 120, alignItems: 'flex-end' },
  memberAmountBox: { width: 128 },
  detailNinkuBox: { width: 64 },
  mid: { fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] },
  small: { fontSize: 13, fontWeight: '700' },
  siteAmount: { fontSize: 16, fontWeight: '800', textAlign: 'right', fontVariant: ['tabular-nums'] },
  memberAmount: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  detail: { paddingHorizontal: Space.l, paddingVertical: Space.s },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Space.m, paddingVertical: 6 },
  detailDate: { width: 86, fontSize: 15, fontWeight: '800' },
  detailText: { fontSize: 15, fontWeight: '700' },
  detailNinku: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
});
