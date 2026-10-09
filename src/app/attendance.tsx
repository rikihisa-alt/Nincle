import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApprovalChip } from '@/components/attendance';
import { BackHeader } from '@/components/header';
import { Screen } from '@/components/screen';
import { BigButton, Card, EmptyState, FitText, Icon, Icons, ListRow, LoadingView, SectionLabel, T, Tanzaku } from '@/components/ui';
import { MinTap, siteColor, Space, useColors } from '@/constants/theme';
import { useAttendances, useMySites } from '@/data/queries';
import { attendanceCsvRows } from '@/lib/aggregate';
import { exportCsv, toCsv } from '@/lib/csv';
import { formatMonth, formatShortDow, lastDayOfMonth, monthKey, shiftMonth, todayJst } from '@/lib/date';
import { Columns } from '@/lib/layout';
import { describeAttendance, formatNinku, formatYen, ninkuAmount, sumNinku } from '@/lib/ninku';
import { useMe } from '@/providers/auth';
import { useToast } from '@/providers/toast';

/** 出面の記録：自分が入れた出面を月ごとに一覧。合計と、自分の分のCSV */
export default function AttendanceLogScreen() {
  const c = useColors();
  const toast = useToast();
  const { userId, profile } = useMe();
  const [month, setMonth] = useState(monthKey(todayJst()));
  const from = `${month}-01`;
  const to = lastDayOfMonth(month);
  const sites = useMySites();
  const atts = useAttendances({ from, to, userId });
  const list = [...(atts.data ?? [])].sort((a, b) => b.work_date.localeCompare(a.work_date));
  const siteList = sites.data ?? [];
  const order = siteList.map((s) => s.id);
  const nameOf = (id: string) => siteList.find((s) => s.id === id)?.name ?? '現場';

  const total = sumNinku(list.map((a) => a.computed_ninku));
  const amount = list.reduce((s, a) => s + ninkuAmount(a.computed_ninku, a.unit_price), 0);
  const days = new Set(list.map((a) => a.work_date)).size;
  const pending = list.filter((a) => !a.approved_at).length;

  const onExport = async () => {
    if (!list.length) return toast('この月の出面はありません', 'info');
    const rows = attendanceCsvRows({
      range: { start: from, end: to },
      sites: siteList,
      users: profile ? [{ id: profile.id, display_name: profile.display_name, trade: profile.trade, phone: profile.phone }] : [],
      attendances: list,
    });
    try {
      await exportCsv(`出面_${profile?.display_name ?? ''}_${month}.csv`, toCsv(rows));
      toast('CSVを書き出しました', 'ok');
    } catch {
      toast('書き出せませんでした', 'error');
    }
  };

  const summary = (
    <>
      <View style={styles.monthBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="前の月"
          onPress={() => setMonth(shiftMonth(month, -1))}
          style={[styles.navBtn, { borderColor: c.border, backgroundColor: c.cardAlt }]}>
          <Icon name={Icons.chevronLeft} size={26} color={c.text} />
        </Pressable>
        <T style={styles.month} font="heading">
          {formatMonth(month)}
        </T>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="次の月"
          onPress={() => setMonth(shiftMonth(month, 1))}
          style={[styles.navBtn, { borderColor: c.border, backgroundColor: c.cardAlt }]}>
          <Icon name={Icons.chevron} size={26} color={c.text} />
        </Pressable>
      </View>
      <Tanzaku stripe={c.accent} style={styles.mt}>
        <View style={styles.totals}>
          <View style={styles.flex}>
            <FitText style={styles.big}>{formatNinku(total)}</FitText>
            <T tone="textSub" style={styles.unit}>
              人工
            </T>
          </View>
          <View style={styles.flex}>
            <FitText style={styles.big}>{`${days}`}</FitText>
            <T tone="textSub" style={styles.unit}>
              日
            </T>
          </View>
        </View>
        <View style={styles.rowBetween}>
          <T tone="textSub" style={styles.meta}>
            稼ぎ（税抜）
          </T>
          <FitText style={styles.amount} align="right" boxStyle={styles.flex}>{`${formatYen(amount)}円`}</FitText>
        </View>
        {pending > 0 && <T style={[styles.meta, { color: c.statusSoon }]}>承認待ちが {pending} 件あります</T>}
      </Tanzaku>
      <BigButton label="CSVで書き出す" icon={Icons.download} kind="secondary" onPress={onExport} style={styles.mt} />
      <BigButton
        label="今日の出面を入れる"
        icon={Icons.edit}
        onPress={() => router.push({ pathname: '/day/[date]', params: { date: todayJst() } })}
        style={styles.mt}
      />
    </>
  );

  const rows = (
    <>
      <SectionLabel>{`出面（${list.length}件）`}</SectionLabel>
      {atts.isLoading ? (
        <LoadingView />
      ) : list.length === 0 ? (
        <EmptyState title="この月の出面はありません" />
      ) : (
        <Card>
          {list.map((a, i) => (
            <ListRow
              key={a.id}
              first={i === 0}
              title={`${formatShortDow(a.work_date)}　${nameOf(a.site_id)}`}
              sub={`${describeAttendance(a.unit, a.overtime_hours)}・${formatNinku(a.computed_ninku)}人工・${formatYen(ninkuAmount(a.computed_ninku, a.unit_price))}円`}
              left={<View style={[styles.bar, { backgroundColor: siteColor(a.site_id, order) }]} />}
              right={<ApprovalChip approved={Boolean(a.approved_at)} />}
              onPress={() => router.push({ pathname: '/day/[date]', params: { date: a.work_date } })}
            />
          ))}
        </Card>
      )}
    </>
  );

  return (
    <Screen header={<BackHeader title="出面の記録" sub="自分が入れた出面" />} onRefresh={() => atts.refetch()}>
      <Columns flex={[2, 3]}>{[<View key="s">{summary}</View>, <View key="l">{rows}</View>]}</Columns>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mt: { marginTop: Space.m },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Space.l },
  navBtn: { width: MinTap, height: MinTap, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  month: { fontSize: 22, fontWeight: '900' },
  totals: { flexDirection: 'row', gap: Space.l },
  big: { fontSize: 40, fontWeight: '800' },
  unit: { fontSize: 15, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: Space.s },
  meta: { fontSize: 15, fontWeight: '700' },
  amount: { fontSize: 24, fontWeight: '800' },
  bar: { width: 6, alignSelf: 'stretch', borderRadius: 3 },
});
