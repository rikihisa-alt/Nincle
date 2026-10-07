import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AttendanceEditor } from '@/components/attendance';
import { ChoiceChips } from '@/components/form';
import { BackHeader } from '@/components/header';
import { Screen } from '@/components/screen';
import { BigButton, ErrorView, Icons, LoadingView, SectionLabel, T, Tanzaku } from '@/components/ui';
import { siteColor, Space, useColors } from '@/constants/theme';
import { useAssignments, useAttendances, useMySites } from '@/data/queries';
import { addDays, formatLong, formatShortDow, isValidYmd, relativeDay, todayJst } from '@/lib/date';
import { useMe } from '@/providers/auth';

/** 1日分：その日に入る現場と、自分の出面 */
export default function DayScreen() {
  const { date: param } = useLocalSearchParams<{ date: string }>();
  const date = isValidYmd(param ?? '') ? param : todayJst();
  const c = useColors();
  const { userId } = useMe();
  const today = todayJst();
  const sites = useMySites();
  const assignments = useAssignments({ from: date, to: date, userId });
  const attendances = useAttendances({ from: date, to: date, userId });
  const [extraSite, setExtraSite] = useState<string | null>(null);

  const siteList = sites.data ?? [];
  const siteById = new Map(siteList.map((s) => [s.id, s]));
  const planned = (assignments.data ?? []).filter((a) => siteById.has(a.site_id));
  const entered = attendances.data ?? [];
  const shownIds = [...new Set([...planned.map((a) => a.site_id), ...entered.map((a) => a.site_id), ...(extraSite ? [extraSite] : [])])];
  const others = siteList.filter((s) => s.status !== 'archived' && !shownIds.includes(s.id));
  const isFuture = date > today;

  const header = (
    <BackHeader title={formatLong(date)} sub={relativeDay(date, today).split(' ')[0] !== formatShortDow(date) ? relativeDay(date, today).split(' ')[0] : null}>
      <View style={styles.nav}>
        <BigButton
          label="前の日"
          kind="secondary"
          compact
          icon={Icons.chevronLeft}
          onPress={() => router.setParams({ date: addDays(date, -1) })}
          style={styles.flex}
        />
        <BigButton
          label="次の日"
          kind="secondary"
          compact
          onPress={() => router.setParams({ date: addDays(date, 1) })}
          style={styles.flex}
        />
      </View>
    </BackHeader>
  );

  if (sites.error || assignments.error) {
    return (
      <Screen size="narrow" header={header}>
        <ErrorView message="読み込めませんでした" onRetry={() => void sites.refetch()} />
      </Screen>
    );
  }
  if (sites.isLoading || assignments.isLoading || attendances.isLoading) {
    return (
      <Screen size="narrow" header={header}>
        <LoadingView />
      </Screen>
    );
  }

  return (
    <Screen size="narrow" header={header} onRefresh={() => Promise.all([assignments.refetch(), attendances.refetch()])}>
      {shownIds.length === 0 && (
        <T tone="textSub" style={styles.empty}>
          この日の予定は入っていません。
        </T>
      )}
      {shownIds.map((siteId) => {
        const s = siteById.get(siteId)!;
        const plan = planned.find((a) => a.site_id === siteId);
        const att = entered.find((a) => a.site_id === siteId);
        return (
          <View key={siteId}>
            <SectionLabel>{plan ? '予定の現場' : '予定外の現場'}</SectionLabel>
            <Tanzaku stripe={siteColor(siteId, siteList.map((x) => x.id))}>
              <T style={styles.siteName} onPress={() => router.push({ pathname: '/site/[id]', params: { id: siteId } })}>
                {s.name} ›
              </T>
              {plan && (plan.meet_time || plan.note) && (
                <T style={styles.plan}>{[plan.meet_time ? `${plan.meet_time} 集合` : null, plan.note].filter(Boolean).join(' ／ ')}</T>
              )}
              {s.address && (
                <T tone="textSub" style={styles.meta}>
                  {s.address}
                </T>
              )}
              {isFuture ? (
                <T tone="textSub" style={styles.meta}>
                  出面は当日以降に入れられます
                </T>
              ) : (
                <AttendanceEditor
                  key={`${siteId}-${date}-${att?.updated_at ?? ''}`}
                  siteId={siteId}
                  rule={s.overtime_rule}
                  targetUserId={userId}
                  date={date}
                  existing={att}
                  isAdmin={s.my_role === 'admin'}
                  lockedReason={s.status === 'archived' ? 'アーカイブした現場は見るだけです' : null}
                />
              )}
            </Tanzaku>
          </View>
        );
      })}

      {!isFuture && others.length > 0 && (
        <>
          <SectionLabel>ほかの現場の出面を入れる</SectionLabel>
          <T tone="textSub" style={styles.meta}>
            予定になかった現場に入ったときは、現場を選んでください
          </T>
          <ChoiceChips
            options={others.map((s) => s.id)}
            labels={Object.fromEntries(others.map((s) => [s.id, s.name]))}
            value={null}
            onChange={(id) => setExtraSite(id)}
          />
        </>
      )}
      <View style={[styles.spacer, { borderColor: c.border }]} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  nav: { flexDirection: 'row', gap: Space.s, marginTop: Space.xs },
  empty: { fontSize: 17, fontWeight: '700', marginTop: Space.l },
  siteName: { fontSize: 22, fontWeight: '900' },
  plan: { fontSize: 17, fontWeight: '700' },
  meta: { fontSize: 15, fontWeight: '600' },
  spacer: { height: Space.xl },
});
