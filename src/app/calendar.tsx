import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApprovalChip } from '@/components/attendance';
import { MonthCalendar, type DayMark } from '@/components/calendar';
import { BackHeader } from '@/components/header';
import { Screen } from '@/components/screen';
import { BigButton, Card, Chip, EmptyState, Icons, ListRow, LoadingView, SectionLabel, T } from '@/components/ui';
import { siteColor, Space, useColors } from '@/constants/theme';
import { useAssignments, useAttendances, useMyPendingRequests, useMySites } from '@/data/queries';
import { formatLong, lastDayOfMonth, monthKey, relativeDay, todayJst } from '@/lib/date';
import { Columns } from '@/lib/layout';
import { describeAttendance, formatNinku } from '@/lib/ninku';
import { useMe } from '@/providers/auth';

/** カレンダー：自分の予定を月で見て、日を選ぶとその日の現場と出面が分かる */
export default function CalendarScreen() {
  const c = useColors();
  const { userId } = useMe();
  const today = todayJst();
  const [month, setMonth] = useState(monthKey(today));
  const [selected, setSelected] = useState(today);
  const from = `${month}-01`;
  const to = lastDayOfMonth(month);

  const sites = useMySites();
  const assignments = useAssignments({ from, to, userId });
  const attendances = useAttendances({ from, to, userId });
  const pending = useMyPendingRequests();
  const siteList = sites.data ?? [];
  const order = siteList.map((s) => s.id);
  const nameOf = (id: string) => siteList.find((s) => s.id === id)?.name ?? '現場';

  const marks: Record<string, DayMark[]> = {};
  for (const a of assignments.data ?? []) {
    (marks[a.work_date] ??= []).push({ color: siteColor(a.site_id, order), label: nameOf(a.site_id) });
  }
  for (const r of pending.data ?? []) {
    if (r.target_date_from >= from && r.target_date_from <= to) {
      (marks[r.target_date_from] ??= []).push({ color: c.border, label: `返事待ち：${r.site_name}` });
    }
  }

  const dayPlans = (assignments.data ?? []).filter((a) => a.work_date === selected);
  const dayAtts = (attendances.data ?? []).filter((a) => a.work_date === selected);
  const daySites = [...new Set([...dayPlans.map((a) => a.site_id), ...dayAtts.map((a) => a.site_id)])];
  const dayWaiting = (pending.data ?? []).filter((r) => selected >= r.target_date_from && selected <= r.target_date_to);
  const monthSites = [...new Set((assignments.data ?? []).map((a) => a.site_id))];

  const calendar = (
    <>
      <Card style={styles.calCard}>
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          marks={marks}
          selected={selected}
          onSelect={(d) => {
            setSelected(d);
            if (monthKey(d) !== month) setMonth(monthKey(d));
          }}
        />
      </Card>
      {monthSites.length > 0 && (
        <View style={styles.legend}>
          {monthSites.map((id) => (
            <View key={id} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: siteColor(id, order) }]} />
              <T style={styles.legendText}>{nameOf(id)}</T>
            </View>
          ))}
        </View>
      )}
    </>
  );

  const detail = (
    <>
      <SectionLabel>{relativeDay(selected, today)}</SectionLabel>
      {assignments.isLoading ? (
        <LoadingView />
      ) : daySites.length === 0 && dayWaiting.length === 0 ? (
        <EmptyState title="この日の予定はありません" body={selected <= today ? '予定外の現場に入ったときは、下のボタンから出面を入れられます。' : undefined} />
      ) : (
        <Card>
          {daySites.map((id, i) => {
            const plan = dayPlans.find((a) => a.site_id === id);
            const att = dayAtts.find((a) => a.site_id === id);
            return (
              <ListRow
                key={id}
                first={i === 0}
                title={nameOf(id)}
                sub={[
                  plan?.meet_time ? `${plan.meet_time} 集合` : null,
                  plan?.note,
                  att ? `出面：${describeAttendance(att.unit, att.overtime_hours)}（${formatNinku(att.computed_ninku)}人工）` : selected <= today ? '出面：まだ' : null,
                ]
                  .filter(Boolean)
                  .join('　')}
                left={<View style={[styles.bar, { backgroundColor: siteColor(id, order) }]} />}
                right={att ? <ApprovalChip approved={Boolean(att.approved_at)} /> : undefined}
                onPress={() => router.push({ pathname: '/site/[id]', params: { id } })}
              />
            );
          })}
          {dayWaiting.map((r, i) => (
            <ListRow
              key={r.id}
              first={daySites.length === 0 && i === 0}
              title={r.site_name}
              sub="入れるかどうか、まだ返事していません"
              right={<Chip label="返事待ち" icon={Icons.question} fg={c.statusSoon} bg={c.statusSoonBg} />}
              onPress={() => router.push({ pathname: '/site/[id]', params: { id: r.site_id, tab: 'yotei' } })}
            />
          ))}
        </Card>
      )}
      {selected <= today && (
        <BigButton
          label={`${formatLong(selected)}の出面を入れる`}
          icon={Icons.edit}
          onPress={() => router.push({ pathname: '/day/[date]', params: { date: selected } })}
          style={styles.mt}
        />
      )}
    </>
  );

  return (
    <Screen header={<BackHeader title="カレンダー" sub="日付を押すと、その日の現場と出面が出ます" />}>
      <Columns flex={[3, 2]}>{[<View key="cal">{calendar}</View>, <View key="day">{detail}</View>]}</Columns>
    </Screen>
  );
}

const styles = StyleSheet.create({
  calCard: { padding: Space.m, marginTop: Space.l },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.m, marginTop: Space.m },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 15, fontWeight: '700' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  bar: { width: 6, alignSelf: 'stretch', borderRadius: 3 },
  mt: { marginTop: Space.m },
});
