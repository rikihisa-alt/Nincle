import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/form';
import { BackHeader } from '@/components/header';
import { Screen } from '@/components/screen';
import { Avatar, Card, EmptyState, Hint, Icon, Icons, LoadingView, SectionLabel, T } from '@/components/ui';
import { MinTap, Space, useColors } from '@/constants/theme';
import { useBusyDays, useMySites, useMyTeams, useTeam } from '@/data/queries';
import { dayOfWeek, eachDay, formatMonth, formatShortDow, lastDayOfMonth, monthKey, shiftMonth, todayJst } from '@/lib/date';

const CELL = 34;
const NAME_W = 96;

/**
 * 仲間の空き：チームの人ごとに、予定が入っている日を月の表で見る（現場名は出さない）。
 * 日を選ぶと空いている人が分かり、そのまま「入れるか聞く」に進める。
 */
export default function AvailabilityScreen() {
  const c = useColors();
  const today = todayJst();
  const teams = useMyTeams();
  const [teamId, setTeamId] = useState<string | null>(null);
  const currentTeamId = teamId ?? teams.data?.[0]?.id ?? null;
  const team = useTeam(currentTeamId);
  const [month, setMonth] = useState(monthKey(today));
  const [day, setDay] = useState<string | null>(today);
  const days = eachDay(`${month}-01`, lastDayOfMonth(month));
  const busy = useBusyDays(currentTeamId, { from: days[0], to: days[days.length - 1] });
  const sites = useMySites();
  const adminSites = (sites.data ?? []).filter((s) => s.my_role === 'admin' && s.status === 'active' && s.team_id === currentTeamId);

  const members = team.data?.members ?? [];
  const busySet = new Set((busy.data ?? []).map((b) => `${b.user_id}:${b.work_date}`));
  const isBusy = (uid: string, d: string) => busySet.has(`${uid}:${d}`);
  const freeCount = (d: string) => members.filter((m) => !isBusy(m.user_id, d)).length;
  const freeOnDay = day ? members.filter((m) => !isBusy(m.user_id, day)) : [];
  const dowColor = (d: string) => (dayOfWeek(d) === 0 ? c.statusOver : dayOfWeek(d) === 6 ? c.info : c.textSub);

  return (
    <Screen header={<BackHeader title="仲間の空き" sub="予定が入っている日だけ色がつきます（現場名は出ません）" />}>
      {(teams.data ?? []).length > 1 && (
        <ChoiceChips
          options={(teams.data ?? []).map((t) => t.id)}
          labels={Object.fromEntries((teams.data ?? []).map((t) => [t.id, t.name]))}
          value={currentTeamId}
          onChange={setTeamId}
        />
      )}

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

      {team.isLoading || busy.isLoading ? (
        <LoadingView />
      ) : members.length === 0 ? (
        <EmptyState title="チームがまだありません" />
      ) : (
        <Card style={styles.table}>
          <View style={styles.tableRow}>
            {/* 名前の列は固定、日付の列は横に動かせる */}
            <View style={{ width: NAME_W }}>
              <View style={[styles.headCell, { borderBottomColor: c.border }]} />
              {members.map((m) => (
                <View key={m.user_id} style={[styles.nameCell, { borderBottomColor: c.border }]}>
                  <Avatar name={m.user?.display_name ?? '？'} size={26} />
                  <T style={styles.name} numberOfLines={1}>
                    {m.user?.display_name}
                  </T>
                </View>
              ))}
              <View style={styles.footCell}>
                <T tone="textSub" style={styles.footLabel}>
                  空き
                </T>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View style={styles.tableRow}>
                  {days.map((d) => {
                    const sel = d === day;
                    return (
                      <Pressable
                        key={d}
                        accessibilityRole="button"
                        accessibilityLabel={`${formatShortDow(d)}、空き${freeCount(d)}人`}
                        onPress={() => setDay(d)}
                        style={[styles.headCell, styles.dayHead, { borderBottomColor: c.border }, sel && { backgroundColor: c.accent }]}>
                        <T font="number" style={[styles.dayNum, { color: sel ? c.onAccent : c.text }]}>
                          {Number(d.slice(8))}
                        </T>
                        <T style={[styles.dow, { color: sel ? c.onAccent : dowColor(d) }]}>{'日月火水木金土'[dayOfWeek(d)]}</T>
                      </Pressable>
                    );
                  })}
                </View>
                {members.map((m) => (
                  <View key={m.user_id} style={styles.tableRow}>
                    {days.map((d) => {
                      const b = isBusy(m.user_id, d);
                      return (
                        <View
                          key={d}
                          accessible
                          accessibilityLabel={`${m.user?.display_name}、${formatShortDow(d)}、${b ? '予定あり' : '空き'}`}
                          style={[
                            styles.cell,
                            { borderBottomColor: c.border, borderLeftColor: c.border },
                            d === day && { backgroundColor: c.cardAlt },
                            d === today && { borderLeftColor: c.text, borderLeftWidth: 2 },
                          ]}>
                          {b && <View style={[styles.busy, { backgroundColor: c.statusActive }]} />}
                        </View>
                      );
                    })}
                  </View>
                ))}
                <View style={styles.tableRow}>
                  {days.map((d) => (
                    <View key={d} style={[styles.footCell, styles.cellNum]}>
                      <T font="number" style={[styles.free, { color: freeCount(d) === members.length ? c.ok : c.text }]}>
                        {freeCount(d)}
                      </T>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>
        </Card>
      )}

      <Hint>「空きを仲間に見せない」にしている人は、いつも空きに見えます。灰色の帯が「予定あり」です。</Hint>

      {day && members.length > 0 && (
        <>
          <SectionLabel>{`${formatShortDow(day)}に空いている人（${freeOnDay.length}人）`}</SectionLabel>
          <T style={styles.freeNames}>{freeOnDay.map((m) => m.user?.display_name).join('・') || 'いません'}</T>
          {adminSites.length > 0 && day >= today && (
            <>
              <T tone="textSub" style={styles.askLabel}>
                この日に入れるか聞く現場を選んでください
              </T>
              <ChoiceChips
                options={adminSites.map((s) => s.id)}
                labels={Object.fromEntries(adminSites.map((s) => [s.id, s.name]))}
                value={null}
                onChange={(id) => router.push({ pathname: '/site/[id]/request', params: { id, date: day } })}
              />
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: Space.l },
  navBtn: { width: MinTap, height: MinTap, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  month: { fontSize: 22, fontWeight: '900' },
  table: { paddingVertical: Space.s, marginBottom: Space.m },
  tableRow: { flexDirection: 'row' },
  headCell: { height: 52, borderBottomWidth: 1 },
  dayHead: { width: CELL, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: 15, fontWeight: '700', lineHeight: 18 },
  dow: { fontSize: 11, fontWeight: '800', lineHeight: 14 },
  nameCell: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Space.s, borderBottomWidth: 1 },
  name: { flex: 1, fontSize: 15, fontWeight: '800' },
  cell: { width: CELL, height: 44, borderBottomWidth: 1, borderLeftWidth: 1, alignItems: 'center', justifyContent: 'center' },
  busy: { width: CELL - 10, height: 18, borderRadius: 4 },
  footCell: { height: 40, justifyContent: 'center', paddingHorizontal: Space.s },
  cellNum: { width: CELL, alignItems: 'center', paddingHorizontal: 0 },
  footLabel: { fontSize: 13, fontWeight: '800' },
  free: { fontSize: 15, fontWeight: '800' },
  freeNames: { fontSize: 18, fontWeight: '800' },
  askLabel: { fontSize: 15, fontWeight: '700', marginTop: Space.m },
});
