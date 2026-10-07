import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApprovalChip, AttendanceEditor } from '@/components/attendance';
import { DatePickerModal } from '@/components/calendar';
import {
  Avatar,
  BigButton,
  Card,
  EmptyState,
  Hint,
  Icon,
  Icons,
  ListRow,
  LoadingView,
  SectionLabel,
  T,
  Tanzaku,
  FitText,
} from '@/components/ui';
import { MinTap, Space, useColors } from '@/constants/theme';
import type { SiteDetail } from '@/data/api';
import { api } from '@/data/client';
import { useAction, useAttendances, useClosings } from '@/data/queries';
import { addDays, formatLong, formatShortDow, relativeDay, todayJst } from '@/lib/date';
import { describeAttendance, formatNinku, sumNinku } from '@/lib/ninku';
import { useMe } from '@/providers/auth';

/** 出面タブ：日付を選んで、自分の分（管理者はみんなの分）を入れる */
export function DezuraTab({ detail, initialDate }: { detail: SiteDetail; initialDate?: string }) {
  const c = useColors();
  const { userId } = useMe();
  const { site, members, myRole, team } = detail;
  const isAdmin = myRole === 'admin';
  const today = todayJst();
  const [date, setDate] = useState(initialDate && initialDate <= today ? initialDate : today);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const { run, busy } = useAction();

  const dayAtts = useAttendances({ from: date, to: date, siteIds: [site.id] });
  const recent = useAttendances({ from: addDays(today, -62), to: today, siteIds: [site.id] });
  const closings = useClosings(team.id);

  const closedOn = (d: string) => (closings.data ?? []).some((cl) => d >= cl.period_start && d <= cl.period_end);
  const lockedReason =
    site.status === 'archived'
      ? 'アーカイブした現場は見るだけです'
      : closedOn(date)
        ? 'この月は確定済みです。直すときは親方に確定を戻してもらってください'
        : null;
  const priceOf = (uid: string) => members.find((m) => m.user_id === uid)?.unit_price ?? site.default_unit_price;
  const mine = (dayAtts.data ?? []).find((a) => a.user_id === userId);
  const amMember = members.some((m) => m.user_id === userId);
  const pending = (recent.data ?? []).filter((a) => !a.approved_at && !closedOn(a.work_date));
  const myRecent = (recent.data ?? []).filter((a) => a.user_id === userId).sort((a, b) => b.work_date.localeCompare(a.work_date));
  const nameOf = (uid: string) => members.find((m) => m.user_id === uid)?.user?.display_name ?? '退会した人';

  return (
    <>
      <View style={styles.dateBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="前の日"
          onPress={() => setDate(addDays(date, -1))}
          style={[styles.navBtn, { borderColor: c.border, backgroundColor: c.cardAlt }]}>
          <Icon name={Icons.chevronLeft} size={26} color={c.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${formatLong(date)}。押すと日付を選べます`}
          onPress={() => setPicking(true)}
          style={[styles.dateBtn, { borderColor: c.border, backgroundColor: c.card }]}>
          <Icon name={Icons.calendar} size={22} color={c.text} />
          <T style={styles.dateText}>{relativeDay(date, today)}</T>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="次の日"
          disabled={date >= today}
          onPress={() => setDate(addDays(date, 1))}
          style={[styles.navBtn, { borderColor: c.border, backgroundColor: c.cardAlt, opacity: date >= today ? 0.35 : 1 }]}>
          <Icon name={Icons.chevron} size={26} color={c.text} />
        </Pressable>
      </View>
      <DatePickerModal
        visible={picking}
        title="出面を入れる日"
        initial={date}
        max={today}
        onClose={() => setPicking(false)}
        onPick={(d) => {
          setDate(d);
          setPicking(false);
        }}
      />

      {dayAtts.isLoading ? (
        <LoadingView />
      ) : (
        <>
          {amMember && (
            <>
              <SectionLabel>{`自分の出面（${formatShortDow(date)}）`}</SectionLabel>
              <Tanzaku stripe={c.accent}>
                <AttendanceEditor
                  key={`${date}-${mine?.updated_at ?? 'new'}`}
                  siteId={site.id}
                  rule={site.overtime_rule}
                  targetUserId={userId}
                  date={date}
                  existing={mine}
                  isAdmin={isAdmin}
                  lockedReason={lockedReason}
                  unitPrice={priceOf(userId)}
                />
              </Tanzaku>
            </>
          )}

          {isAdmin && (
            <>
              <SectionLabel>{`みんなの出面（${formatShortDow(date)}）`}</SectionLabel>
              <Hint>名前を押すと、その人の分を代わりに入れたり直したりできます。管理者が入れた分は承認済みになります。</Hint>
              <Card style={styles.mt}>
                {members
                  .filter((m) => m.user_id !== userId)
                  .map((m, i) => {
                    const att = (dayAtts.data ?? []).find((a) => a.user_id === m.user_id);
                    const open = editing === m.user_id;
                    return (
                      <View key={m.user_id} style={i > 0 && { borderTopWidth: 1, borderTopColor: c.border }}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ expanded: open }}
                          accessibilityLabel={`${m.user?.display_name}、${att ? describeAttendance(att.unit, att.overtime_hours) : '未入力'}`}
                          onPress={() => setEditing(open ? null : m.user_id)}
                          style={styles.memberRow}>
                          <Avatar name={m.user?.display_name ?? '？'} size={36} />
                          <View style={styles.flex}>
                            <T style={styles.memberName}>{m.user?.display_name}</T>
                            <T tone="textSub" style={styles.meta}>
                              {att ? `${describeAttendance(att.unit, att.overtime_hours)}（${formatNinku(att.computed_ninku)}人工）` : '未入力'}
                            </T>
                          </View>
                          {att && <ApprovalChip approved={Boolean(att.approved_at)} />}
                          <Icon name={open ? Icons.close : Icons.edit} size={22} color={c.textSub} />
                        </Pressable>
                        {open && (
                          <View style={styles.inlineEditor}>
                            {att && !att.approved_at && !lockedReason && (
                              <BigButton
                                label="このまま承認する"
                                icon={Icons.check}
                                busy={busy}
                                onPress={() => run(() => api.approveAttendances([att.id]), `${m.user?.display_name}さんの出面を承認しました`)}
                              />
                            )}
                            <AttendanceEditor
                              key={`${m.user_id}-${date}-${att?.updated_at ?? 'new'}`}
                              siteId={site.id}
                              rule={site.overtime_rule}
                              targetUserId={m.user_id}
                              targetName={m.user?.display_name}
                              date={date}
                              existing={att}
                              isAdmin
                              lockedReason={lockedReason}
                              unitPrice={priceOf(m.user_id)}
                              onDone={() => setEditing(null)}
                            />
                          </View>
                        )}
                      </View>
                    );
                  })}
              </Card>

              <SectionLabel>{`承認待ち（${pending.length}件）`}</SectionLabel>
              {pending.length === 0 ? (
                <T tone="textSub" style={styles.none}>
                  承認待ちの出面はありません
                </T>
              ) : (
                <>
                  <Card>
                    {pending.map((a, i) => (
                      <ListRow
                        key={a.id}
                        first={i === 0}
                        title={`${formatShortDow(a.work_date)}　${nameOf(a.user_id)}`}
                        sub={`${describeAttendance(a.unit, a.overtime_hours)}（${formatNinku(a.computed_ninku)}人工）`}
                        right={
                          <BigButton
                            label="承認"
                            compact
                            disabled={busy}
                            onPress={() => run(() => api.approveAttendances([a.id]), '承認しました')}
                          />
                        }
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
          )}

          {amMember && (
            <>
              <SectionLabel>{`自分のこれまで（2か月・${formatNinku(sumNinku(myRecent.map((a) => a.computed_ninku)))}人工）`}</SectionLabel>
              {myRecent.length === 0 ? (
                <EmptyState title="この現場の出面はまだありません" />
              ) : (
                <Card>
                  {myRecent.map((a, i) => (
                    <ListRow
                      key={a.id}
                      first={i === 0}
                      title={formatShortDow(a.work_date)}
                      sub={`${describeAttendance(a.unit, a.overtime_hours)}・${a.approved_at ? '承認済み' : '承認待ち'}`}
                      right={<FitText style={styles.ninku} align="right" boxStyle={styles.ninkuBox}>{formatNinku(a.computed_ninku)}</FitText>}
                      onPress={() => setDate(a.work_date)}
                    />
                  ))}
                </Card>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mt: { marginTop: Space.s },
  dateBar: { flexDirection: 'row', alignItems: 'center', gap: Space.s, marginTop: Space.l },
  navBtn: { width: MinTap, height: MinTap, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dateBtn: { flex: 1, minHeight: MinTap, borderRadius: 10, borderWidth: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Space.s },
  dateText: { fontSize: 19, fontWeight: '900' },
  memberRow: { minHeight: MinTap + 8, flexDirection: 'row', alignItems: 'center', gap: Space.s, paddingHorizontal: Space.l, paddingVertical: Space.s },
  memberName: { fontSize: 18, fontWeight: '800' },
  meta: { fontSize: 14, fontWeight: '600' },
  inlineEditor: { paddingHorizontal: Space.l, paddingBottom: Space.l, gap: Space.m },
  none: { fontSize: 16, fontWeight: '700' },
  ninkuBox: { width: 64 },
  ninku: { fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
});
